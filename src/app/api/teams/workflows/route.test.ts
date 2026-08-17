import { describe, expect, it, vi, beforeEach } from "vitest";

/** Workflows are global files with no team field, so "which workflows belong
 * to this team" is derived. The derivation is the whole feature — get it wrong
 * and a team page either hides its own playbooks or claims someone else's.
 */

const runJigga = vi.fn();
const runJiggaJson = vi.fn();

vi.mock("@/lib/jigga-cli", () => ({
  runJigga: (args: string[]) => runJigga(args),
  runJiggaJson: (args: string[]) => runJiggaJson(args),
}));

const { GET, PUT } = await import("./route");

const TEAM = {
  id: "mt",
  default_workflows: ["declared_flow"],
  agents: [{ id: "mt-lead", role: "lead" }, { id: "mt-editor", role: "review" }],
};

const YAML: Record<string, string> = {
  declared_flow: "id: declared_flow\nname: Declared\ntrigger:\n  schedule: weekdays at 09:00\nsteps:\n- {id: a, agent: someone_else, action: x}\n",
  installed_flow: "id: installed_flow\nname: Installed\nsteps:\n- {id: a, action: x}\n",
  agent_flow: "id: agent_flow\nname: By Agents\ntrigger:\n  manual: true\nnodes:\n- {id: a, agent: mt-editor, type: tool, action: x}\n",
  stranger_flow: "id: stranger_flow\nname: Stranger\nsteps:\n- {id: a, agent: nobody, action: x}\n",
};

function get(query: string) {
  return GET(new Request(`http://localhost/api/teams/workflows${query}`));
}

function wire({ installed = [{ scaffold_id: "mt", artifacts: ["workflows/installed_flow.yaml"] }] } = {}) {
  runJiggaJson.mockImplementation((args: string[]) => {
    if (args[0] === "workflow" && args[1] === "list") {
      return Promise.resolve(Object.keys(YAML).map((id) => ({ id, name: id, status: "draft" })));
    }
    if (args[0] === "team" && args[1] === "get") return Promise.resolve(TEAM);
    if (args[0] === "recipes") return Promise.resolve(installed);
    return Promise.resolve([]);
  });
  runJigga.mockImplementation((args: string[]) => {
    if (args[1] === "cat") {
      const body = YAML[args[2]];
      return Promise.resolve(body
        ? { ok: true, exitCode: 0, stdout: body, stderr: "" }
        : { ok: false, exitCode: 1, stdout: `Workflow not found: '${args[2]}'.`, stderr: "" });
    }
    return Promise.resolve({ ok: true, exitCode: 0, stdout: "{}", stderr: "" });
  });
}

beforeEach(() => {
  runJigga.mockReset();
  runJiggaJson.mockReset();
  wire();
});

async function listed() {
  const body = (await (await get("?teamId=mt")).json()) as {
    workflows: { id: string; via: string; agents: string[]; trigger: string | null; stepCount: number }[];
  };
  return body.workflows;
}

describe("association", () => {
  it("includes a workflow the team declared", async () => {
    const found = (await listed()).find((w) => w.id === "declared_flow");
    expect(found?.via).toBe("declared");
  });

  it("includes one this team's recipe installed", async () => {
    const found = (await listed()).find((w) => w.id === "installed_flow");
    expect(found?.via).toBe("installed");
  });

  it("includes one that runs this team's agents", async () => {
    const found = (await listed()).find((w) => w.id === "agent_flow");
    expect(found?.via).toBe("agents");
    expect(found?.agents).toEqual(["mt-editor"]);
  });

  it("excludes a workflow with no connection to the team", async () => {
    expect((await listed()).map((w) => w.id)).not.toContain("stranger_flow");
  });

  it("ignores another team's install record", async () => {
    wire({ installed: [{ scaffold_id: "other_team", artifacts: ["workflows/installed_flow.yaml"] }] });
    expect((await listed()).map((w) => w.id)).not.toContain("installed_flow");
  });

  it("prefers the strongest signal when several apply", async () => {
    // declared_flow names an agent NOT on the team, so only the declaration
    // qualifies it — but if both applied, "declared" is the honest answer.
    const found = (await listed()).find((w) => w.id === "declared_flow");
    expect(found?.via).toBe("declared");
    expect(found?.agents).toEqual([]);   // no team members in its steps
  });

  it("lists declared workflows before inferred ones", async () => {
    expect((await listed()).map((w) => w.via)).toEqual(["declared", "installed", "agents"]);
  });
});

describe("details", () => {
  it("counts v1 steps and v2 nodes alike", async () => {
    const all = await listed();
    expect(all.find((w) => w.id === "declared_flow")?.stepCount).toBe(1);
    expect(all.find((w) => w.id === "agent_flow")?.stepCount).toBe(1);
  });

  it("summarises the trigger", async () => {
    const all = await listed();
    expect(all.find((w) => w.id === "declared_flow")?.trigger).toBe("schedule: weekdays at 09:00");
    expect(all.find((w) => w.id === "agent_flow")?.trigger).toBe("manual");
    expect(all.find((w) => w.id === "installed_flow")?.trigger).toBeNull();
  });

  it("keeps a declared workflow whose file cannot be read, and drops an inferred one", async () => {
    // Unreadable between `workflow list` and `workflow cat` (deleted, or
    // corrupt). A workflow the team DECLARED still belongs to it — hiding it
    // would hide the problem. One that only qualified by naming team agents
    // cannot be judged without its steps, so it drops.
    runJigga.mockResolvedValue({ ok: false, exitCode: 1, stdout: "gone", stderr: "" });
    const all = await listed();
    expect(all.map((w) => w.id)).toEqual(["declared_flow", "installed_flow"]);
    expect(all[0]).toMatchObject({ stepCount: 0, trigger: null, agents: [] });
  });
});

describe("editing", () => {
  it("returns one workflow's raw yaml", async () => {
    const body = (await (await get("?teamId=mt&id=declared_flow")).json()) as { content: string };
    expect(body.content).toContain("id: declared_flow");
  });

  it("saves through core so validation applies", async () => {
    runJigga.mockResolvedValue({ ok: true, exitCode: 0, stdout: '{"workflow":"declared_flow"}', stderr: "" });
    const res = await PUT(new Request("http://localhost/api/teams/workflows", {
      method: "PUT",
      body: JSON.stringify({ id: "declared_flow", content: "id: declared_flow\nname: X\n" }),
    }));
    expect(runJigga).toHaveBeenCalledWith([
      "workflow", "save", "declared_flow", "--content", "id: declared_flow\nname: X\n", "--json",
    ]);
    expect(res.status).toBe(200);
  });

  it("surfaces core's refusal instead of a generic failure", async () => {
    // The reason is the useful part: "`id: other` does not match…", "cycle".
    runJigga.mockResolvedValue({
      ok: false, exitCode: 1,
      stdout: "! Not saved — workflow cyc: workflow graph has a cycle", stderr: "",
    });
    const res = await PUT(new Request("http://localhost/api/teams/workflows", {
      method: "PUT",
      body: JSON.stringify({ id: "cyc", content: "id: cyc\n" }),
    }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining("cycle") });
  });

  it("rejects a flag-shaped id before shelling out", async () => {
    const res = await PUT(new Request("http://localhost/api/teams/workflows", {
      method: "PUT",
      body: JSON.stringify({ id: "--home", content: "x" }),
    }));
    expect(res.status).toBe(400);
    expect(runJigga).not.toHaveBeenCalled();
  });
});
