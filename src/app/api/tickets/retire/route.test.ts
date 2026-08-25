import { describe, expect, it, vi, beforeEach } from "vitest";

/** Taking a ticket off the board.
 *
 * One route, two verbs. What it must never do is guess which one was meant:
 * archive keeps the file and delete does not, so a missing or unrecognised
 * `action` is a 400 rather than a default.
 */

const runJigga = vi.fn();
vi.mock("@/lib/jigga-cli", () => ({ runJigga: (args: string[]) => runJigga(args) }));

const { POST } = await import("./route");

const ok = (stdout = JSON.stringify({ task: "task_abc", action: "archive" })) =>
  ({ ok: true, exitCode: 0, stdout, stderr: "" });
const err = (stdout: string) => ({ ok: false, exitCode: 1, stdout, stderr: "" });

const post = (body: unknown) =>
  POST(new Request("https://x/api/tickets/retire", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  runJigga.mockReset();
  runJigga.mockResolvedValue(ok());
});

describe("validation", () => {
  it("requires a task id", async () => {
    expect((await post({ action: "archive" })).status).toBe(400);
    expect(runJigga).not.toHaveBeenCalled();
  });

  it("rejects a task id that could be read as a flag", async () => {
    expect((await post({ task: "--home", action: "delete" })).status).toBe(400);
    expect(runJigga).not.toHaveBeenCalled();
  });

  it("refuses to guess when action is missing", async () => {
    const res = await post({ task: "task_abc" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/archive.*delete/);
    expect(runJigga).not.toHaveBeenCalled();
  });

  it("refuses an unrecognised action", async () => {
    expect((await post({ task: "task_abc", action: "destroy" })).status).toBe(400);
    expect(runJigga).not.toHaveBeenCalled();
  });
});

describe("argv", () => {
  it("archives", async () => {
    await post({ task: "task_abc", action: "archive" });
    expect(runJigga).toHaveBeenCalledWith(["task", "archive", "task_abc", "--json"]);
  });

  it("deletes", async () => {
    await post({ task: "task_abc", action: "delete" });
    expect(runJigga).toHaveBeenCalledWith(["task", "delete", "task_abc", "--json"]);
  });

  it("forwards the act-as identity, which gated lanes need", async () => {
    await post({ task: "task_abc", action: "delete", as: "test" });
    expect(runJigga.mock.calls[0][0]).toContain("--as=test");
  });
});

describe("results", () => {
  it("returns what core reported", async () => {
    runJigga.mockResolvedValue(ok(JSON.stringify({ task: "task_abc", action: "delete" })));
    expect(await (await post({ task: "task_abc", action: "delete" })).json())
      .toEqual({ task: "task_abc", action: "delete" });
  });

  it("reports a gate refusal as a conflict, with core's message", async () => {
    runJigga.mockResolvedValue(err(
      "Lane 'testing' is gated by 'test': only they take a ticket out of it, including by deleting"));
    const res = await post({ task: "task_abc", action: "delete", as: "dev" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/gated by 'test'/);
  });

  it("reports an unknown ticket as a conflict", async () => {
    runJigga.mockResolvedValue(err("Task not found: task_gone"));
    expect((await post({ task: "task_gone", action: "archive" })).status).toBe(409);
  });
});
