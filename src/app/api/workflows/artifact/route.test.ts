import { describe, expect, it, vi, beforeEach } from "vitest";

/** The bytes of a run's deliverable move through here in both directions, so
 * what matters is that this route stays a pipe: it must not invent content, and
 * it must not decide on core's behalf what may be written — confinement and the
 * running-run refusal live in the CLI, and duplicating them here would mean two
 * rules to keep in step.
 */

const runJigga = vi.fn();
const runJiggaWithInput = vi.fn();

vi.mock("@/lib/jigga-cli", () => ({
  runJigga: (args: string[]) => runJigga(args),
  runJiggaWithInput: (args: string[], input: string) => runJiggaWithInput(args, input),
}));

const { GET, PUT } = await import("./route");

function get(query: string) {
  return GET(new Request(`https://x/api/workflows/artifact?${query}`));
}

function put(body: unknown) {
  return PUT(new Request("https://x/api/workflows/artifact", {
    method: "PUT", body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  runJigga.mockReset();
  runJiggaWithInput.mockReset();
});

describe("GET", () => {
  it("returns the file's text verbatim", async () => {
    runJigga.mockResolvedValue({ ok: true, exitCode: 0, stdout: "# draft\n\nbody\n", stderr: "" });
    const body = await (await get("runId=run_1&name=copy.md")).json();
    expect(runJigga).toHaveBeenCalledWith(["workflow", "artifact", "run_1", "copy.md"]);
    expect(body).toMatchObject({ exists: true, content: "# draft\n\nbody\n" });
  });

  it("reports a missing file as an ordinary state, not an error", async () => {
    // A node that has not run yet has no output. Rendering that as a red error
    // would make an unstarted workflow look broken.
    runJigga.mockResolvedValue({ ok: false, exitCode: 1, stdout: "No artifact 'copy.md' in run 'run_1'.", stderr: "" });
    const res = await get("runId=run_1&name=copy.md");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.exists).toBe(false);
    expect(body.content).toBeNull();
    expect(body.note).toContain("No artifact");
  });

  it("rejects arguments that would be read as flags", async () => {
    for (const q of ["runId=--home&name=copy.md", "runId=run_1&name=-rf", "runId=&name=copy.md"]) {
      expect((await get(q)).status).toBe(400);
    }
    expect(runJigga).not.toHaveBeenCalled();
  });
});

describe("PUT", () => {
  it("sends the body on stdin, never in argv", async () => {
    // argv is world-readable through /proc; a deliverable has no business in
    // `ps` for every other account on the machine.
    runJiggaWithInput.mockResolvedValue({ ok: true, exitCode: 0,
      stdout: '{"artifact":"copy.md","created":false}', stderr: "" });
    const body = await (await put({ runId: "run_1", name: "copy.md", content: "fixed\n" })).json();
    const [args, input] = runJiggaWithInput.mock.calls[0];
    expect(args).toEqual(["workflow", "artifact-save", "run_1", "copy.md", "--json"]);
    expect(input).toBe("fixed\n");
    expect(args.join(" ")).not.toContain("fixed");
    expect(body).toMatchObject({ artifact: "copy.md" });
  });

  it("surfaces core's refusal instead of a generic failure", async () => {
    // "Run … is running — a node may be writing this file right now" is the
    // whole answer; replacing it with "save failed" wastes it.
    runJiggaWithInput.mockResolvedValue({ ok: false, exitCode: 1,
      stdout: "! Run run_1 is running — a node may be writing this file right now.", stderr: "" });
    const res = await put({ runId: "run_1", name: "copy.md", content: "x" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("is running");
  });

  it("does not decide confinement itself — a traversing name still reaches core", async () => {
    // Core resolves and refuses. Rejecting here too would be a second rule to
    // keep in step with the first, and the first is the one that is enforced.
    runJiggaWithInput.mockResolvedValue({ ok: false, exitCode: 1,
      stdout: "! Artifact '../../config.yaml' escapes the run directory", stderr: "" });
    const res = await put({ runId: "run_1", name: "../../config.yaml", content: "x" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("escapes");
  });

  it("rejects a flag-shaped runId before shelling out", async () => {
    expect((await put({ runId: "--home", name: "copy.md", content: "x" })).status).toBe(400);
    expect(runJiggaWithInput).not.toHaveBeenCalled();
  });

  it("writes an empty file rather than silently skipping", async () => {
    // Clearing a draft is a legitimate edit; treating "" as "nothing to do"
    // would leave the old content in place while reporting success.
    runJiggaWithInput.mockResolvedValue({ ok: true, exitCode: 0, stdout: "{}", stderr: "" });
    await put({ runId: "run_1", name: "copy.md", content: "" });
    expect(runJiggaWithInput.mock.calls[0][1]).toBe("");
  });
});
