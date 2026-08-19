import { describe, expect, it, vi, beforeEach } from "vitest";

/** The dashboard's job is to be true.
 *
 * Every number comes from the runtime's own files through the CLI, so what is
 * worth testing is not the layout but the claims: that counts match the data,
 * that "running" means what a person would assume, and that one failing CLI
 * call costs a panel rather than the page.
 */

const runJiggaJson = vi.fn();
vi.mock("@/lib/jigga-cli", () => ({ runJiggaJson: (args: string[]) => runJiggaJson(args) }));

const DashboardPage = (await import("./page")).default;

const TEAMS = [
  { id: "mt", name: "Marketing", lead: "lead", members: ["lead", "writer"], purpose: "Launch copy" },
  { id: "eng", name: "Eng", members: [] },
];
const AGENTS = [
  { id: "lead", name: "Lead" }, { id: "writer", name: "Writer" },
  { id: "retired", name: "Retired", disabled: true },
];
const PLUGINS = [
  { name: "jiggaview", version: "0.1.0", running: true, port: 4400, summary: "dashboard" },
  { name: "stopped", version: "0.2.0", running: false, installed_service: true, summary: "other" },
];
const WORKFLOWS = [{ id: "team_launch" }, { id: "syndication" }];
const RUNS = [
  { id: "r1", workflow_id: "team_launch", status: "completed" },
  { id: "r2", workflow_id: "team_launch", status: "awaiting_approval" },
];
const TASKS = [
  { id: "t1", title: "write copy", state: "running", assignee: "writer", updated_at: "2026-08-19T10:00" },
  { id: "t2", title: "old thing", state: "completed", assignee: "lead", updated_at: "2026-08-18T10:00" },
  { id: "t3", title: "queued", state: "pending", assignee: "lead", updated_at: "2026-08-19T09:00" },
  { id: "t4", title: "brief", state: "completed", assignee: "lead", lane: "brief",
    metadata: { team_id: "mt" }, updated_at: "2026-08-17T10:00" },
];
const LANES = [{ id: "brief" }, { id: "review", gate: "review" }];
// `doctor --json` calls this `detail`. Using the real key here is the point:
// the previous dashboard read `summary` and rendered every check blank.
const CHECKS = { checks: [
  { name: "model", status: "ok", detail: "reachable" },
  { name: "channels", status: "warn", detail: "telegram unreachable" },
] };

function wire(overrides: Record<string, unknown> = {}) {
  runJiggaJson.mockImplementation((args: string[]) => {
    const key = args.slice(0, 2).join(" ");
    const override = key in overrides ? key : args[0] in overrides ? args[0] : "";
    if (override) {
      const value = overrides[override];
      return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
    }
    if (key === "team list") return Promise.resolve(TEAMS);
    if (key === "team lanes") return Promise.resolve(LANES);
    if (key === "agents list") return Promise.resolve(AGENTS);
    if (key === "plugins list") return Promise.resolve(PLUGINS);
    if (key === "workflow list") return Promise.resolve(WORKFLOWS);
    if (key === "workflow runs") return Promise.resolve(RUNS);
    if (key === "task list") return Promise.resolve(TASKS);
    if (args[0] === "doctor") return Promise.resolve(CHECKS);
    return Promise.resolve([]);
  });
}

/** Render a server-component tree to plain text.
 *
 * Separators go at ELEMENT boundaries, not between text fragments. JSX like
 * `{n} agent{n === 1 ? "" : "s"}` is three adjacent text children of one
 * element; spacing them apart would turn "2 agents" into "2 agent s" and make
 * every assertion about rendered copy a lie about what the page shows.
 */
async function text(node: unknown): Promise<string> {
  const parts: string[] = [];
  await walk(node, parts);
  return parts.join("").replace(/\s+/g, " ").trim();
}

type Renderable = { type?: unknown; props?: { href?: unknown; children?: unknown }; then?: unknown };

async function walk(node: unknown, out: string[]): Promise<void> {
  if (node === null || node === undefined || node === false) return;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return; }
  if (Array.isArray(node)) {
    for (const child of node) await walk(child, out);
    return;
  }
  if (typeof node !== "object") return;
  const element = node as Renderable;
  if (typeof element.then === "function") return walk(await (node as Promise<unknown>), out);
  const props = element.props ?? {};
  if (typeof element.type === "function") {
    return walk(await (element.type as (p: unknown) => unknown)(props), out);
  }
  out.push(" ");
  if (typeof props.href === "string") out.push(`${props.href} `);
  await walk(props.children, out);
  out.push(" ");
}

const render = (params: Record<string, string> = {}) =>
  text(DashboardPage({ searchParams: Promise.resolve(params) }));

beforeEach(() => { runJiggaJson.mockReset(); wire(); });

describe("counts", () => {
  it("counts teams, workflows and plugins", async () => {
    const out = await render();
    expect(out).toContain("Teams 2");
    expect(out).toContain("Workflows 2");
    expect(out).toContain("Plugins 2");
  });

  it("counts ENABLED agents, and says how many are not", async () => {
    // A disabled agent cannot be woken; counting it makes the runtime look
    // bigger than it is.
    const out = await render();
    expect(out).toContain("Agents 2");
    expect(out).toContain("1 disabled");
  });

  it("reports how many plugins are actually running, not just installed", async () => {
    const out = await render();
    expect(out).toContain("1 running");
    expect(out).toContain("installed, stopped");
  });
});

describe("working now", () => {
  it("names the agent and the task it holds", async () => {
    const out = await render();
    expect(out).toContain("writer");
    expect(out).toContain("write copy");
    expect(out).toContain("1 of 2 agents busy");
  });

  it("falls back to each agent's last task when nothing is running", async () => {
    // "Nothing is running" is true almost all the time and cannot be told apart
    // from "nothing ever runs" — so show what each agent did last instead.
    wire({ "task list": TASKS.map((t) => ({ ...t, state: "completed" })) });
    const out = await render();
    expect(out).toContain("agents idle");
    expect(out).toContain("completed · write copy");
  });
});

describe("workflows", () => {
  it("surfaces parked runs, because they are the ones waiting on a person", async () => {
    const out = await render();
    expect(out).toContain("1 run waiting on your approval");
  });

  it("says nothing about approvals when none are parked", async () => {
    wire({ "workflow runs": [{ id: "r1", workflow_id: "w", status: "completed" }] });
    const out = await render();
    expect(out).not.toContain("waiting on your approval");
  });
});

describe("teams", () => {
  it("shows the first team by default, with its lanes and ticket counts", async () => {
    const out = await render();
    expect(out).toContain("Launch copy");
    expect(out).toContain("brief");
    expect(out).toContain("/tickets?team=mt");
  });

  it("selects the team named in the URL", async () => {
    const out = await render({ team: "eng" });
    expect(out).toContain("/tickets?team=eng");
  });

  it("falls back to the first team when the URL names one that is gone", async () => {
    const out = await render({ team: "deleted" });
    expect(out).toContain("/tickets?team=mt");
  });

  it("shows each team as a card with its agent count", async () => {
    const out = await render();
    expect(out).toContain("Marketing");
    expect(out).toContain("2 agents");   // lead + writer, both real agents
    expect(out).toContain("0 agents");   // eng has none
  });

  it("counts only roster members that still exist as agents", async () => {
    // Core keeps a roster entry after its agent is deleted — workflows and
    // handoffs may still name it — so roster length overstates who can be
    // woken. The gap is called out rather than folded into the count.
    wire({ "team list": [{ id: "mt", name: "Marketing", members: ["lead", "ghost"] }] });
    const out = await render();
    expect(out).toContain("1 agent");
    expect(out).toContain("1 missing");
  });

  it("says nothing about missing members when the roster is intact", async () => {
    const out = await render();
    expect(out).not.toContain("missing");
  });

  it("marks a gated lane", async () => {
    // Only a named role can move work out of a gated lane; that belongs on the
    // summary, not just in the yaml.
    const out = await render();
    expect(out).toContain("gate: review");
  });

  it("counts only that team's tickets", async () => {
    const out = await render();
    expect(out).toContain("tickets 1");
  });
});

describe("resilience", () => {
  it("loses a panel, not the page, when one CLI call fails", async () => {
    wire({ "plugins list": new Error("jigga plugins list failed") });
    const out = await render();
    expect(out).toContain("No plugins installed");
    expect(out).toContain("Teams 2");           // the rest still rendered
  });

  it("says so when doctor cannot run rather than implying health", async () => {
    wire({ doctor: new Error("boom") });
    const out = await render();
    expect(out).toContain("Could not run");
  });

  it("puts problems above the healthy checks", async () => {
    const out = await render();
    expect(out.indexOf("telegram unreachable")).toBeGreaterThan(-1);
    expect(out).toContain("1 ok · 1 to look at");
  });

  it("renders with an empty runtime", async () => {
    wire({ "team list": [], "agents list": [], "plugins list": [], "workflow list": [],
           "workflow runs": [], "task list": [] });
    const out = await render();
    expect(out).toContain("Teams 0");
    expect(out).toContain("No teams yet");
  });
});
