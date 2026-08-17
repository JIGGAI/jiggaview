import { describe, expect, it, vi, beforeEach } from "vitest";

/** The team's reach, assembled from per-agent grants.
 *
 * The failure that matters here is a tab that under-reports what a team can
 * do — a missing grant reads as "this agent cannot act" when it can, which is
 * exactly backwards for a security surface.
 */

const runJigga = vi.fn();
const runJiggaJson = vi.fn();

vi.mock("@/lib/jigga-cli", () => ({
  runJigga: (args: string[]) => runJigga(args),
  runJiggaJson: (args: string[]) => runJiggaJson(args),
}));

const { GET } = await import("./route");

const TOOLS: Record<string, unknown[]> = {
  "mt-lead": [
    { action: "filesystem.read_file", capability: "filesystem", status: "ready", risk_level: "low", reason: null },
    { action: "task.assign", capability: "team-orchestration", status: "ready", risk_level: "medium", reason: null },
    { action: "shell.run", capability: "shell", status: "needs_approval", risk_level: "high", reason: "risk_level high" },
  ],
  "mt-editor": [],
};

function wire({ members = [{ id: "mt-lead" }, { id: "mt-editor" }], skills = { skills: [], pending_approval: [] } } = {}) {
  runJiggaJson.mockImplementation((args: string[]) => {
    if (args[0] === "team") return Promise.resolve({ agents: members });
    if (args[0] === "agents" && args[1] === "tools") {
      const rows = TOOLS[args[2]];
      return rows ? Promise.resolve(rows) : Promise.reject(new Error(`No agent named '${args[2]}'`));
    }
    if (args[0] === "skills") return Promise.resolve(skills);
    return Promise.resolve([]);
  });
}

const get = (query: string) => GET(new Request(`http://localhost/api/teams/skills${query}`));

beforeEach(() => {
  runJigga.mockReset();
  runJiggaJson.mockReset();
  wire();
});

it("reports every member's effective toolset", async () => {
  const body = (await (await get("?teamId=mt")).json()) as {
    members: { id: string; tools: { action: string }[] }[];
  };
  expect(body.members.map((m) => m.id)).toEqual(["mt-lead", "mt-editor"]);
  expect(body.members[0].tools.map((t) => t.action)).toEqual([
    "filesystem.read_file", "task.assign", "shell.run",
  ]);
});

it("keeps the status and risk of each grant", async () => {
  // A grant that needs approval is not the same as one that runs, and the tab
  // is where you notice the difference.
  const body = (await (await get("?teamId=mt")).json()) as {
    members: { tools: { action: string; status: string; risk_level: string }[] }[];
  };
  const shell = body.members[0].tools.find((t) => t.action === "shell.run");
  expect(shell).toMatchObject({ status: "needs_approval", risk_level: "high" });
});

it("shows an agent with no grants as exactly that", async () => {
  const body = (await (await get("?teamId=mt")).json()) as { members: { id: string; tools: unknown[] }[] };
  expect(body.members[1]).toMatchObject({ id: "mt-editor", tools: [] });
});

it("does not fail the whole tab for one unstaffed member", async () => {
  // A membership-only member has no agent yaml. That is normal, and it must not
  // hide the grants of everyone else.
  wire({ members: [{ id: "mt-lead" }, { id: "not_staffed_yet" }] });
  const body = (await (await get("?teamId=mt")).json()) as {
    members: { id: string; tools: unknown[]; error?: string }[];
  };
  expect(body.members[0].tools).toHaveLength(3);
  expect(body.members[1]).toMatchObject({ id: "not_staffed_yet", tools: [] });
  expect(body.members[1].error).toContain("No agent named");
});

it("carries the skill catalog, including packs awaiting approval", async () => {
  wire({ skills: { skills: [{ name: "outline" }], pending_approval: [{ name: "risky" }] } });
  const body = (await (await get("?teamId=mt")).json()) as {
    skills: { name: string }[]; pendingSkills: { name: string }[];
  };
  expect(body.skills.map((s) => s.name)).toEqual(["outline"]);
  expect(body.pendingSkills.map((s) => s.name)).toEqual(["risky"]);
});

it("still answers when the skill catalog cannot be read", async () => {
  runJiggaJson.mockImplementation((args: string[]) => {
    if (args[0] === "team") return Promise.resolve({ agents: [{ id: "mt-lead" }] });
    if (args[0] === "agents") return Promise.resolve(TOOLS["mt-lead"]);
    return Promise.reject(new Error("skills unavailable"));
  });
  const body = (await (await get("?teamId=mt")).json()) as { members: unknown[]; skills: unknown[] };
  expect(body.members).toHaveLength(1);
  expect(body.skills).toEqual([]);
});

it("rejects a flag-shaped team id before shelling out", async () => {
  const res = await get("?teamId=--home");
  expect(res.status).toBe(400);
  expect(runJiggaJson).not.toHaveBeenCalled();
});

describe("no write path", () => {
  it("exposes no mutation — grants are changed on the agent's page", async () => {
    const route = await import("./route");
    expect(Object.keys(route).filter((k) => ["POST", "PUT", "PATCH", "DELETE"].includes(k)))
      .toEqual([]);
  });
});
