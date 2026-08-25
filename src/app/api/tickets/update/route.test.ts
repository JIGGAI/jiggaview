import { describe, expect, it, vi, beforeEach } from "vitest";

/** Editing a filed ticket.
 *
 * The rule that matters: core reads an omitted flag as "leave this field
 * alone", so the route must send only what the form actually changed. Sending
 * every field on every save would silently overwrite a description someone
 * edited elsewhere with whatever this form last rendered.
 */

const runJigga = vi.fn();
vi.mock("@/lib/jigga-cli", () => ({ runJigga: (args: string[]) => runJigga(args) }));

const { POST } = await import("./route");

const TASK = { id: "task_abc", title: "Edited", state: "pending" };
const ok = (stdout = JSON.stringify(TASK)) => ({ ok: true, exitCode: 0, stdout, stderr: "" });
const err = (stdout: string) => ({ ok: false, exitCode: 1, stdout, stderr: "" });

const post = (body: unknown) =>
  POST(new Request("https://x/api/tickets/update", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  runJigga.mockReset();
  runJigga.mockResolvedValue(ok());
});

describe("validation", () => {
  it("requires a task id", async () => {
    expect((await post({ title: "x" })).status).toBe(400);
    expect(runJigga).not.toHaveBeenCalled();
  });

  it("rejects a task id that could be read as a flag", async () => {
    // the id is positional, so it cannot use the --flag=value trick
    expect((await post({ task: "--home", title: "x" })).status).toBe(400);
    expect(runJigga).not.toHaveBeenCalled();
  });

  it("refuses an update that changes nothing", async () => {
    const res = await post({ task: "task_abc", as: "rj" });
    expect(res.status).toBe(400);
    expect(runJigga).not.toHaveBeenCalled();
  });
});

describe("argv", () => {
  it("sends only the fields present in the body", async () => {
    await post({ task: "task_abc", title: "Edited" });
    expect(runJigga).toHaveBeenCalledWith(["task", "update", "task_abc", "--title=Edited", "--json"]);
  });

  it("forwards an empty assignee, because that is how you unassign", async () => {
    await post({ task: "task_abc", assignee: "" });
    expect(runJigga.mock.calls[0][0]).toContain("--assignee=");
  });

  it("forwards an empty description, because that is how you clear it", async () => {
    await post({ task: "task_abc", description: "" });
    expect(runJigga.mock.calls[0][0]).toContain("--description=");
  });

  it("passes a dash-leading title without it being read as a flag", async () => {
    await post({ task: "task_abc", title: "-n flag handling" });
    expect(runJigga.mock.calls[0][0]).toContain("--title=-n flag handling");
  });

  it("forwards the act-as identity", async () => {
    await post({ task: "task_abc", title: "T", as: "lead" });
    expect(runJigga.mock.calls[0][0]).toContain("--as=lead");
  });
});

describe("results", () => {
  it("returns the updated ticket", async () => {
    expect(await (await post({ task: "task_abc", title: "Edited" })).json()).toEqual(TASK);
  });

  it("reports an unknown ticket as a conflict, not a server error", async () => {
    runJigga.mockResolvedValue(err("Task not found: task_gone"));
    const res = await post({ task: "task_gone", title: "x" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Task not found: task_gone");
  });
});
