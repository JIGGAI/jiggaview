import { describe, expect, it, vi, beforeEach } from "vitest";

/** Events merged two nav entries into one page with two tabs.
 *
 * The behaviour worth pinning is not the layout: it is that nothing got lost in
 * the merge. The old paths still resolve, the team filter still narrows the
 * task list, and an unknown tab lands somewhere real rather than rendering
 * nothing.
 */

const runJiggaJson = vi.fn();
vi.mock("@/lib/jigga-cli", () => ({
  runJiggaJson: (args: string[]) => runJiggaJson(args),
}));

const EventsPage = (await import("./page")).default;
const { href } = await import("./query");

const TASKS = [
  { id: "t1", title: "write copy", state: "pending", assignee: "writer", updated_at: "2026-08-19T10:00:00" },
  { id: "t2", title: "review", state: "completed", assignee: "outsider", updated_at: "2026-08-19T09:00:00" },
];
const TEAMS = [{ id: "mt", members: ["writer"] }];
const EVENTS = [{ ts: "2026-08-19T10:00:00", type: "agent.wake", status: "ok", details: { agent: "writer" } }];

/** Render a server-component tree to plain text.
 *
 * Walks children and collects strings plus `href`s, rather than serialising the
 * elements — React elements hold circular owner references, so JSON.stringify
 * cannot be the shortcut here.
 */
async function text(node: unknown): Promise<string> {
  const parts: string[] = [];
  await walk(node, parts);
  return parts.join(" ").replace(/\s+/g, " ");
}

type Renderable = {
  type?: unknown;
  props?: { href?: unknown; children?: unknown };
  then?: unknown;
};

async function walk(node: unknown, out: string[]): Promise<void> {
  if (node === null || node === undefined || node === false) return;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) await walk(child, out);
    return;
  }
  if (typeof node !== "object") return;
  const element = node as Renderable;
  if (typeof element.then === "function") return walk(await (node as Promise<unknown>), out);
  const props = element.props ?? {};
  if (typeof element.type === "function") {
    const render = element.type as (p: unknown) => unknown;
    return walk(await render(props), out);
  }
  if (typeof props.href === "string") out.push(props.href);
  await walk(props.children, out);
}

beforeEach(() => {
  runJiggaJson.mockReset();
  runJiggaJson.mockImplementation((args: string[]) => {
    if (args[0] === "task") return Promise.resolve(structuredClone(TASKS));
    if (args[0] === "team") return Promise.resolve(TEAMS);
    return Promise.resolve(EVENTS);
  });
});

describe("tabs", () => {
  it("defaults to Runs", async () => {
    const out = await text(await EventsPage({ searchParams: Promise.resolve({}) }));
    expect(out).toContain("agent.wake");
    expect(out).not.toContain("write copy");
  });

  it("shows Tasks when asked", async () => {
    const out = await text(await EventsPage({ searchParams: Promise.resolve({ tab: "tasks" }) }));
    expect(out).toContain("write copy");
    expect(out).not.toContain("agent.wake");
  });

  it("falls back to Runs for an unknown tab rather than rendering nothing", async () => {
    const out = await text(await EventsPage({ searchParams: Promise.resolve({ tab: "../etc" }) }));
    expect(out).toContain("agent.wake");
  });

  it("keeps the team filter on the tab links so switching tabs does not widen the view", async () => {
    const out = await text(await EventsPage({
      searchParams: Promise.resolve({ tab: "tasks", team: "mt" }),
    }));
    expect(out).toContain("/events?tab=runs&team=mt");
    expect(out).toContain("/events?tab=tasks&team=mt");
  });

  it("still filters tasks to the team", async () => {
    const out = await text(await EventsPage({
      searchParams: Promise.resolve({ tab: "tasks", team: "mt" }),
    }));
    expect(out).toContain("write copy");
    expect(out).not.toContain("review");   // assigned outside the team
  });
});

describe("filters, sorting and paging", () => {
  const many = Array.from({ length: 120 }, (_, i) => ({
    id: `t${String(i).padStart(3, "0")}`,
    title: `task ${i}`,
    state: i % 2 ? "pending" : "completed",
    assignee: i % 3 ? "writer" : "lead",
    updated_at: `2026-08-${String(1 + (i % 28)).padStart(2, "0")}T10:00:00`,
  }));

  function withTasks(rows: unknown[] = many) {
    runJiggaJson.mockImplementation((args: string[]) => {
      if (args[0] === "task") return Promise.resolve(structuredClone(rows));
      if (args[0] === "team") return Promise.resolve(TEAMS);
      return Promise.resolve(EVENTS);
    });
  }

  const render = (params: Record<string, string>) =>
    text(EventsPage({ searchParams: Promise.resolve(params) }));

  it("shows 100 per page by default — what the page showed before paging existed", async () => {
    withTasks();
    const out = await render({ tab: "tasks" });
    expect(out).toContain("1–100 of 120");
    expect(out).toContain("task 27");        // newest by updated_at
    expect(out).not.toContain("task 0 ");    // oldest — falls to page 2
  });

  it("pages forward", async () => {
    withTasks();
    const out = await render({ tab: "tasks", page: "1" });
    expect(out).toContain("101–120 of 120");
  });

  it("clamps an absurd page size rather than reading everything", async () => {
    // `?size=1e9` is a denial of service against the box, not a preference.
    withTasks();
    const out = await render({ tab: "tasks", size: "999999" });
    expect(out).toContain("1–120 of 120");   // clamped to the 250 maximum
  });

  it("filters tasks by state", async () => {
    withTasks();
    const out = await render({ tab: "tasks", state: "completed" });
    expect(out).toContain("of 60");
  });

  it("searches title and id", async () => {
    withTasks([{ id: "t1", title: "write launch copy", state: "pending", updated_at: "2026-08-19" },
               { id: "zz9", title: "something else", state: "pending", updated_at: "2026-08-19" }]);
    const out = await render({ tab: "tasks", q: "launch" });
    expect(out).toContain("write launch copy");
    expect(out).not.toContain("something else");
  });

  it("says a filter is why the table is empty", async () => {
    // "No tasks yet" under an active filter reads as an empty system.
    withTasks([]);
    const out = await render({ tab: "tasks", state: "failed" });
    expect(out).toContain("No tasks match these filters");
  });

  it("sorts by a chosen column, and the header link flips direction", async () => {
    withTasks([{ id: "a", title: "alpha", state: "pending", updated_at: "2026-08-01" },
               { id: "b", title: "zulu", state: "pending", updated_at: "2026-08-02" }]);
    const asc = await render({ tab: "tasks", sort: "title", dir: "asc" });
    expect(asc.indexOf("alpha")).toBeLessThan(asc.indexOf("zulu"));
    const desc = await render({ tab: "tasks", sort: "title", dir: "desc" });
    expect(desc.indexOf("zulu")).toBeLessThan(desc.indexOf("alpha"));
    // The active header offers the opposite direction next.
    expect(desc).toContain("sort=title&dir=asc");
  });

  it("sorts blanks last in both directions", async () => {
    // A task with no assignee is missing data, not the alphabetically-first
    // assignee — floating it to the top of an ascending sort is noise.
    withTasks([{ id: "a", title: "has one", state: "pending", assignee: "writer", updated_at: "1" },
               { id: "b", title: "has none", state: "pending", updated_at: "2" }]);
    for (const dir of ["asc", "desc"]) {
      const out = await render({ tab: "tasks", sort: "assignee", dir });
      expect(out.indexOf("has one")).toBeLessThan(out.indexOf("has none"));
    }
  });

  it("pushes run filters down to the CLI instead of filtering the page", async () => {
    // Filtering the fetched rows would report "no matches" while the match sat
    // a page deeper in a 100k-event log.
    withTasks();
    await render({ tab: "runs", type: "agent.tool_call", status: "error", agent: "chief", since: "24h" });
    const args = runJiggaJson.mock.calls.map((c) => c[0]).find((a) => a[0] === "audit");
    expect(args).toEqual(expect.arrayContaining([
      "--type", "agent.tool_call", "--status", "error", "--agent", "chief", "--since", "24h"]));
  });

  it("asks for one row past the page so it knows whether a next page exists", async () => {
    withTasks();
    await render({ tab: "runs", size: "25", page: "1" });
    const args = runJiggaJson.mock.calls.map((c) => c[0]).find((a) => a[0] === "audit");
    expect(args?.[args.indexOf("-n") + 1]).toBe("51");   // (1+1)*25 + 1
  });

  it("bounds how deep run paging can read, and says so", async () => {
    withTasks();
    const out = await render({ tab: "runs", page: "400", size: "250" });
    const args = runJiggaJson.mock.calls.map((c) => c[0]).find((a) => a[0] === "audit");
    expect(args?.[args.indexOf("-n") + 1]).toBe("5000");
    expect(out).toContain("most recent 5,000");
  });

  it("changing a filter or sort resets the page", async () => {
    // Staying on page 4 of a result set you just replaced shows an empty table
    // and reads as "no matches".
    const current = { tab: "tasks", page: "2", state: "pending" };
    expect(href(current, { sort: "title", dir: "asc" })).not.toContain("page=");
    expect(href(current, { state: "failed" })).not.toContain("page=");
    // …but paging itself keeps its page, obviously.
    expect(href(current, { page: 3 })).toContain("page=3");
  });
});
