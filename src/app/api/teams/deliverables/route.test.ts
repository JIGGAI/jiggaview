import { describe, expect, it, vi, beforeEach } from "vitest";

/** A team's deliverables are the files its workflow runs wrote.
 *
 * The scoping is what matters: a team page must show its OWN output, not every
 * run on the machine, and the association rules have to match the Workflows tab
 * or the two views disagree about what belongs to the team.
 */

const runJigga = vi.fn();
const runJiggaJson = vi.fn();

vi.mock("@/lib/jigga-cli", () => ({
  runJigga: (args: string[]) => runJigga(args),
  runJiggaJson: (args: string[]) => runJiggaJson(args),
}));

const { GET } = await import("./route");

const TEAM = { id: "mt", default_workflows: ["declared_flow"], agents: [{ id: "mt-lead" }] };

const RUNS = [
  { id: "run_a", workflow_id: "declared_flow", status: "completed",
    completed_at: "2026-08-18T10:00:00+00:00",
    artifacts: [{ name: "summary.md", bytes: 120, modified: "2026-08-18T10:00:00+00:00" }] },
  { id: "run_b", workflow_id: "agent_flow", status: "completed",
    completed_at: "2026-08-18T12:00:00+00:00",
    artifacts: [{ name: "draft.md", bytes: 40, modified: "2026-08-18T12:00:00+00:00" }] },
  { id: "run_c", workflow_id: "someone_elses", status: "completed",
    completed_at: "2026-08-18T13:00:00+00:00",
    artifacts: [{ name: "not-ours.md", bytes: 10, modified: "2026-08-18T13:00:00+00:00" }] },
];

const YAML: Record<string, string> = {
  declared_flow: "id: declared_flow\nname: D\n",
  agent_flow: "id: agent_flow\nname: A\nsteps:\n- {id: s, agent: mt-lead, action: x}\n",
  someone_elses: "id: someone_elses\nname: S\nsteps:\n- {id: s, agent: stranger, action: x}\n",
};

function wire() {
  runJiggaJson.mockImplementation((args: string[]) => {
    if (args[0] === "team") return Promise.resolve(TEAM);
    if (args[0] === "recipes") return Promise.resolve([]);
    if (args[1] === "list") return Promise.resolve(Object.keys(YAML).map((id) => ({ id })));
    if (args[1] === "runs") return Promise.resolve(RUNS);
    return Promise.resolve([]);
  });
  runJigga.mockImplementation((args: string[]) => {
    if (args[1] === "cat") {
      const body = YAML[args[2]];
      return Promise.resolve(body
        ? { ok: true, exitCode: 0, stdout: body, stderr: "" }
        : { ok: false, exitCode: 1, stdout: "not found", stderr: "" });
    }
    if (args[1] === "artifact") {
      return Promise.resolve({ ok: true, exitCode: 0, stdout: "# Today\n", stderr: "" });
    }
    return Promise.resolve({ ok: true, exitCode: 0, stdout: "", stderr: "" });
  });
}

const get = (q: string) => GET(new Request(`http://localhost/api/teams/deliverables${q}`));

beforeEach(() => {
  runJigga.mockReset();
  runJiggaJson.mockReset();
  wire();
});

async function listed() {
  const body = (await (await get("?teamId=mt")).json()) as { deliverables: { name: string }[] };
  return body.deliverables;
}

describe("scoping", () => {
  it("includes output from a declared workflow", async () => {
    expect((await listed()).map((d) => d.name)).toContain("summary.md");
  });

  it("includes output from a workflow that runs this team's agents", async () => {
    expect((await listed()).map((d) => d.name)).toContain("draft.md");
  });

  it("excludes another team's output", async () => {
    // The failure that would matter: one team's page showing another's work.
    expect((await listed()).map((d) => d.name)).not.toContain("not-ours.md");
  });

  it("lists newest first", async () => {
    expect((await listed()).map((d) => d.name)).toEqual(["draft.md", "summary.md"]);
  });

  it("carries the run and workflow each file came from", async () => {
    const first = (await listed())[0] as unknown as { runId: string; workflowId: string };
    expect(first).toMatchObject({ runId: "run_b", workflowId: "agent_flow" });
  });
});

describe("viewing one", () => {
  it("reads an artifact through core", async () => {
    const res = await get("?teamId=mt&runId=run_a&name=summary.md");
    expect(runJigga).toHaveBeenCalledWith(["workflow", "artifact", "run_a", "summary.md"]);
    await expect(res.json()).resolves.toMatchObject({ content: "# Today\n" });
  });

  it("surfaces core's refusal rather than a blank page", async () => {
    runJigga.mockResolvedValue({
      ok: false, exitCode: 1,
      stdout: "! Artifact '../../etc/passwd' escapes the run directory", stderr: "",
    });
    const res = await get("?teamId=mt&runId=run_a&name=../../etc/passwd");
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining("escapes") });
  });

  it("needs both a run and a name", async () => {
    expect((await get("?teamId=mt&runId=run_a")).status).toBe(400);
  });

  it("rejects a flag-shaped team id before shelling out", async () => {
    expect((await get("?teamId=--home")).status).toBe(400);
    expect(runJiggaJson).not.toHaveBeenCalled();
  });
});
