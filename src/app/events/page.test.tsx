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
  return parts.join(" ");
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
