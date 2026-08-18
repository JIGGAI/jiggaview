import { describe, expect, it, vi, beforeEach } from "vitest";

/** Drawing a run means joining two things that live apart: per-node STATE in
 * the run record, and the SHAPE (nodes + edges) in the workflow yaml. The
 * joining is the part worth testing — a graph that silently drops a node or an
 * error edge is a picture that lies.
 */

const runJigga = vi.fn();
const runJiggaJson = vi.fn();

vi.mock("@/lib/jigga-cli", () => ({
  runJigga: (args: string[]) => runJigga(args),
  runJiggaJson: (args: string[]) => runJiggaJson(args),
}));

const { GET, POST } = await import("./route");
type Loaded = import("./route").RunGraph;
type LoadedNode = import("./route").GraphNode;

const DAG = `
id: release_flow
name: Release
nodes:
  - {id: build, type: tool, agent: dev, action: filesystem.read_file}
  - {id: test_unit, type: tool, agent: qa, action: x}
  - {id: test_e2e, type: tool, agent: qa, action: x}
  - {id: rollback, type: tool, agent: devops, action: x}
  - {id: approve, type: human_approval}
  - {id: publish, type: writeback}
edges:
  - {from: build, to: test_unit, on: success}
  - {from: build, to: test_e2e, on: success}
  - {from: build, to: rollback, on: error}
  - {from: test_unit, to: approve, on: success}
  - {from: test_e2e, to: approve, on: success}
  - {from: approve, to: publish, on: success}
`;

const LINEAR = "id: old_flow\nname: Old\nsteps:\n- {id: a, action: x}\n- {id: b, action: y}\n";

const RUNS = [
  { id: "run_dag", workflow_id: "release_flow", engine: "v2", status: "awaiting_approval",
    created_at: "2026-08-18T20:00:00+00:00",
    nodes: {
      build: { status: "done" }, test_unit: { status: "done" }, test_e2e: { status: "running" },
      rollback: { status: "skipped" },
      approve: { status: "awaiting_approval", approval_code: "AB12",
                 delivery: "undelivered", delivery_error: "no owner conversation" },
      publish: { status: "pending" },
    } },
  { id: "run_v1", workflow_id: "old_flow", status: "completed",
    created_at: "2026-08-17T20:00:00+00:00",
    artifacts: [{ name: "out.md", bytes: 12 }] },
];

function wire() {
  runJiggaJson.mockImplementation((args: string[]) =>
    args[1] === "runs" ? Promise.resolve(RUNS) : Promise.resolve([]));
  runJigga.mockImplementation((args: string[]) => {
    if (args[1] === "cat") {
      const bodies: Record<string, string> = { release_flow: DAG, old_flow: LINEAR };
      const body = bodies[args[2]] ?? null;
      return Promise.resolve(body
        ? { ok: true, exitCode: 0, stdout: body, stderr: "" }
        : { ok: false, exitCode: 1, stdout: "not found", stderr: "" });
    }
    return Promise.resolve({ ok: true, exitCode: 0, stdout: "{}", stderr: "" });
  });
}

const get = (q = "") => GET(new Request(`http://localhost/api/workflows/runs${q}`));

async function graphs() {
  const body = (await (await get()).json()) as { runs: Loaded[] };
  return body.runs;
}

/** The run under test must exist — a missing one is a failed assertion, not an
 * optional value to thread through every line below. */
async function graph(runId: string): Promise<Loaded> {
  const found = (await graphs()).find((run) => run.runId === runId);
  if (!found) throw new Error(`no run ${runId} in the response`);
  return found;
}

beforeEach(() => {
  runJigga.mockReset();
  runJiggaJson.mockReset();
  wire();
});

describe("the graph", () => {
  it("joins run state to workflow shape", async () => {
    const dag = await graph("run_dag");
    const byId: Record<string, LoadedNode> = Object.fromEntries(dag.nodes.map((n: LoadedNode) => [n.id, n]));
    expect(byId.build.status).toBe("done");
    expect(byId.build.agent).toBe("dev");          // from the yaml
    expect(byId.test_e2e.status).toBe("running");  // from the run
  });

  it("keeps the error edge distinct from success edges", async () => {
    // An error route drawn like a success route is a picture that lies about
    // what happens next.
    const dag = await graph("run_dag");
    expect(dag.edges).toContainEqual({ from: "build", to: "rollback", on: "error" });
  });

  it("lays a fan-out on one level and rejoins the diamond", async () => {
    const dag = await graph("run_dag");
    const depth: Record<string, number> = Object.fromEntries(dag.nodes.map((n: LoadedNode) => [n.id, n.depth]));
    expect(depth.build).toBe(0);
    expect([depth.test_unit, depth.test_e2e, depth.rollback]).toEqual([1, 1, 1]);
    expect(depth.approve).toBe(2);      // longest path, not first-wins
    expect(depth.publish).toBe(3);
  });

  it("carries the approval code and whether anyone was asked", async () => {
    const dag = await graph("run_dag");
    const approve = dag.nodes.find((n: LoadedNode) => n.id === "approve");
    expect(approve).toMatchObject({ approvalCode: "AB12", delivery: "undelivered" });
    expect(approve?.deliveryError).toContain("no owner conversation");
  });

  it("draws a v1 run as the chain it is", async () => {
    // v1 has no edges; consecutive steps imply them.
    const v1 = await graph("run_v1");
    expect(v1.engine).toBe("v1");
    expect(v1.edges).toEqual([{ from: "a", to: "b", on: "success" }]);
    expect(v1.nodes.map((n: LoadedNode) => n.status)).toEqual(["done", "done"]);
  });

  it("survives a workflow whose file is gone", async () => {
    // The run happened; the definition was deleted afterwards. Losing the whole
    // history to that is worse than drawing what state remains.
    runJigga.mockResolvedValue({ ok: false, exitCode: 1, stdout: "gone", stderr: "" });
    const dag = await graph("run_dag");
    expect(dag.nodes.map((n: LoadedNode) => n.id).sort()).toContain("approve");
    expect(dag.edges).toEqual([]);
  });

  it("lists newest first", async () => {
    expect((await graphs()).map((r) => r.runId)).toEqual(["run_dag", "run_v1"]);
  });
});

describe("answering an approval", () => {
  it("resolves the approval and then resumes the run", async () => {
    runJigga.mockResolvedValue({ ok: true, exitCode: 0, stdout: "{}", stderr: "" });
    const res = await POST(new Request("http://localhost/api/workflows/runs", {
      method: "POST",
      body: JSON.stringify({ runId: "run_dag", code: "AB12", decision: "approve" }),
    }));
    expect(runJigga).toHaveBeenCalledWith(["approvals", "approve", "AB12"]);
    expect(runJigga).toHaveBeenCalledWith(["workflow", "resume", "run_dag"]);
    await expect(res.json()).resolves.toMatchObject({ ok: true, decision: "approve" });
  });

  it("still reports success when only the resume fails", async () => {
    // The decision IS recorded at that point; claiming total failure would
    // invite someone to approve twice.
    runJigga.mockImplementation((args: string[]) =>
      args[0] === "approvals"
        ? Promise.resolve({ ok: true, exitCode: 0, stdout: "{}", stderr: "" })
        : Promise.resolve({ ok: false, exitCode: 1, stdout: "", stderr: "run not found" }));
    const res = await POST(new Request("http://localhost/api/workflows/runs", {
      method: "POST",
      body: JSON.stringify({ runId: "run_dag", code: "AB12", decision: "approve" }),
    }));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.warning).toContain("resuming failed");
  });

  it("does not resume when the approval itself was refused", async () => {
    runJigga.mockResolvedValue({ ok: false, exitCode: 1, stdout: "No pending approval", stderr: "" });
    const res = await POST(new Request("http://localhost/api/workflows/runs", {
      method: "POST",
      body: JSON.stringify({ runId: "run_dag", code: "NOPE", decision: "approve" }),
    }));
    expect(res.status).toBe(500);
    expect(runJigga).not.toHaveBeenCalledWith(["workflow", "resume", "run_dag"]);
  });

  it("accepts only approve or deny", async () => {
    const res = await POST(new Request("http://localhost/api/workflows/runs", {
      method: "POST",
      body: JSON.stringify({ runId: "run_dag", code: "AB12", decision: "maybe" }),
    }));
    expect(res.status).toBe(400);
    expect(runJigga).not.toHaveBeenCalled();
  });
});

describe("node file references", () => {
  const WITH_FILES = `
id: team_launch
steps:
  - id: core_message
    action: draft_with_model
    input: {prompt: "Distill the launch message."}
    output: core_message.md
  - id: copy
    action: draft_with_model
    input: {prompt: "Write a tweet.", core_message: core_message.md}
    output: copy.md
`;

  function wireFiles() {
    runJiggaJson.mockResolvedValue([
      { id: "run_files", workflow_id: "team_launch", status: "completed",
        nodes: { core_message: { status: "done" }, copy: { status: "done" } } },
    ]);
    runJigga.mockResolvedValue({ ok: true, exitCode: 0, stdout: WITH_FILES, stderr: "" });
  }

  it("carries each node's output file", async () => {
    wireFiles();
    const body = await (await GET(new Request("https://x/api/workflows/runs"))).json();
    const nodes: LoadedNode[] = body.runs[0].nodes;
    expect(nodes.find((n) => n.id === "copy")?.output).toBe("copy.md");
  });

  it("counts an input as a file only when a node declares it as an output", async () => {
    // `prompt:` is instruction text and `core_message:` is a reference to what
    // an upstream node wrote. Guessing by "looks like a filename" would list
    // the prompt as a file and offer to open something that does not exist.
    wireFiles();
    const body = await (await GET(new Request("https://x/api/workflows/runs"))).json();
    const nodes: LoadedNode[] = body.runs[0].nodes;
    expect(nodes.find((n) => n.id === "copy")?.inputs).toEqual(["core_message.md"]);
    expect(nodes.find((n) => n.id === "core_message")?.inputs).toEqual([]);
  });

  it("leaves a node with no output null rather than inventing a name", async () => {
    runJiggaJson.mockResolvedValue([
      { id: "r", workflow_id: "w", status: "completed", nodes: { a: { status: "done" } } },
    ]);
    runJigga.mockResolvedValue({ ok: true, exitCode: 0,
      stdout: "id: w\nsteps:\n- {id: a, action: x}\n", stderr: "" });
    const body = await (await GET(new Request("https://x/api/workflows/runs"))).json();
    expect(body.runs[0].nodes[0].output).toBeNull();
    expect(body.runs[0].nodes[0].inputs).toEqual([]);
  });
});
