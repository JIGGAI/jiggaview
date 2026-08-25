import { describe, expect, it, vi, beforeEach } from "vitest";

/** Filing a ticket from the board.
 *
 * The board was read-plus-move only; this is the first way a person creates one
 * from the UI. What the route must get right is the argv it hands core: a title
 * is free text, and the two-argv `--title <value>` form would let a title
 * starting with a dash be parsed as an option.
 */

const runJigga = vi.fn();
vi.mock("@/lib/jigga-cli", () => ({ runJigga: (args: string[]) => runJigga(args) }));

const { POST } = await import("./route");

const TASK = { id: "task_abc", title: "Fix login", lane: "backlog", state: "pending" };
const ok = (stdout = JSON.stringify(TASK)) => ({ ok: true, exitCode: 0, stdout, stderr: "" });
const err = (stdout: string, exitCode = 1) => ({ ok: false, exitCode, stdout, stderr: "" });

const post = (body: unknown) =>
  POST(new Request("https://x/api/tickets/create", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  runJigga.mockReset();
  runJigga.mockResolvedValue(ok());
});

describe("validation", () => {
  it("requires a team", async () => {
    const res = await post({ title: "x" });
    expect(res.status).toBe(400);
    expect(runJigga).not.toHaveBeenCalled();
  });

  it("requires a title", async () => {
    const res = await post({ team: "dev", title: "   " });
    expect(res.status).toBe(400);
    expect(runJigga).not.toHaveBeenCalled();
  });
});

describe("argv", () => {
  it("passes values with = so a leading dash is not read as a flag", async () => {
    await post({ team: "dev", title: "--force is not a flag here" });
    expect(runJigga).toHaveBeenCalledWith([
      "task", "create", "--team=dev", "--title=--force is not a flag here", "--json",
    ]);
  });

  it("sends only the optional fields that have a value", async () => {
    await post({ team: "dev", title: "T", description: "", assignee: "qa", lane: "  " });
    const args = runJigga.mock.calls[0][0];
    expect(args).toContain("--assignee=qa");
    expect(args.some((a: string) => a.startsWith("--description"))).toBe(false);
    expect(args.some((a: string) => a.startsWith("--lane"))).toBe(false);
  });

  it("forwards the act-as identity for the audit trail", async () => {
    await post({ team: "dev", title: "T", as: "rj" });
    expect(runJigga.mock.calls[0][0]).toContain("--as=rj");
  });
});

describe("results", () => {
  it("returns the created ticket", async () => {
    expect(await (await post({ team: "dev", title: "Fix login" })).json()).toEqual(TASK);
  });

  it("surfaces core's message rather than an exit code", async () => {
    runJigga.mockResolvedValue(err(JSON.stringify({ error: "No lane 'nope' on 'dev'." })));
    const res = await post({ team: "dev", title: "T", lane: "nope" });
    expect((await res.json()).error).toBe("No lane 'nope' on 'dev'.");
  });

  it("keeps a non-JSON error readable", async () => {
    runJigga.mockResolvedValue(err("Team 'ghost' has no ticket board"));
    expect((await (await post({ team: "ghost", title: "T" })).json()).error)
      .toBe("Team 'ghost' has no ticket board");
  });
});
