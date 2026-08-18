import { describe, expect, it, vi, beforeEach } from "vitest";

/** The Memory tab's whole job is turning a form into `jigga team memory …`
 * argv. That construction is the boundary worth testing: everything it builds
 * is executed, so a value that slips through as a flag is the failure that
 * matters — not a rendering detail.
 */

const runJigga = vi.fn();
const runJiggaJson = vi.fn();
const runJiggaWithInput = vi.fn();

vi.mock("@/lib/jigga-cli", () => ({
  runJigga: (args: string[]) => runJigga(args),
  runJiggaJson: (args: string[]) => runJiggaJson(args),
  runJiggaWithInput: (args: string[], input: string) => runJiggaWithInput(args, input),
}));

const { GET, POST } = await import("./route");

const ok = (stdout: string) => ({ ok: true, exitCode: 0, stdout, stderr: "" });

function get(query: string) {
  return GET(new Request(`http://localhost/api/teams/memory${query}`));
}

function post(body: unknown) {
  return POST(new Request("http://localhost/api/teams/memory", {
    method: "POST",
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  runJigga.mockReset();
  runJiggaJson.mockReset();
  runJiggaWithInput.mockReset();
  runJigga.mockResolvedValue(ok("{}"));
  runJiggaWithInput.mockResolvedValue(ok("{}"));
  runJiggaJson.mockResolvedValue([]);
});

describe("GET", () => {
  it("lists a team's memory", async () => {
    runJiggaJson.mockResolvedValue([{ id: "mem_1", text: "hi", type: "fact", time: "" }]);
    const res = await get("?teamId=mt");
    expect(runJiggaJson).toHaveBeenCalledWith(["team", "memory", "list", "mt", "--json"]);
    await expect(res.json()).resolves.toEqual({
      entries: [{ id: "mem_1", text: "hi", type: "fact", time: "" }],
    });
  });

  it("asks for the pinned subset when requested", async () => {
    await get("?teamId=mt&pinned=1");
    expect(runJiggaJson).toHaveBeenCalledWith(["team", "memory", "list", "mt", "--json", "--pinned"]);
  });

  it("rejects a missing team without shelling out", async () => {
    const res = await get("");
    expect(res.status).toBe(400);
    expect(runJiggaJson).not.toHaveBeenCalled();
  });

  it("rejects a flag-shaped team id", async () => {
    // Reaches execFile as argv, so `--home` here would retarget the runtime.
    const res = await get("?teamId=--home");
    expect(res.status).toBe(400);
    expect(runJiggaJson).not.toHaveBeenCalled();
  });

  it("surfaces a core failure instead of pretending the store is empty", async () => {
    runJiggaJson.mockRejectedValue(new Error("No workspace for 'ghost'"));
    const res = await get("?teamId=ghost");
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining("No workspace") });
  });
});

describe("POST — add", () => {
  it("passes type and each tag, with the entry text on stdin", async () => {
    // The text is content, and argv is world-readable through /proc — a
    // durable memory entry has no business in `ps`.
    runJiggaWithInput.mockResolvedValue(ok(JSON.stringify({ id: "mem_2" })));
    const res = await post({ teamId: "mt", text: "  ships Tuesday  ", type: "decision", tags: ["launch", "timing"] });
    const [args, input] = runJiggaWithInput.mock.calls[0];
    expect(args).toEqual([
      "team", "memory", "add", "mt", "--type", "decision", "--json",
      "--tag", "launch", "--tag", "timing",
    ]);
    expect(input).toBe("ships Tuesday");
    expect(args.join(" ")).not.toContain("ships Tuesday");
    await expect(res.json()).resolves.toEqual({ id: "mem_2" });
  });

  it("defaults the type to fact", async () => {
    await post({ teamId: "mt", text: "a thing" });
    expect(runJiggaWithInput.mock.calls[0][0]).toContain("fact");
  });

  it("drops a flag-shaped tag but still saves the text", async () => {
    // Losing what someone typed because one tag was odd is the worse outcome.
    await post({ teamId: "mt", text: "keep me", tags: ["good", "--bad"] });
    const [args, input] = runJiggaWithInput.mock.calls[0];
    expect(input).toBe("keep me");
    expect(args).toContain("good");
    expect(args).not.toContain("--bad");
  });

  it("keeps a message that starts with a dash, now that it is not argv", async () => {
    // "- ships Tuesday" is a bullet, not a flag. On stdin it cannot be read as
    // one, so there is nothing left to defend against by rejecting it.
    await post({ teamId: "mt", text: "- ships Tuesday" });
    expect(runJiggaWithInput.mock.calls[0][1]).toBe("- ships Tuesday");
  });

  it("rejects empty text", async () => {
    const res = await post({ teamId: "mt", text: "   " });
    expect(res.status).toBe(400);
    expect(runJiggaWithInput).not.toHaveBeenCalled();
  });
});

describe("POST — pin", () => {
  it("pins by entry id", async () => {
    runJigga.mockResolvedValue(ok(JSON.stringify({ id: "mem_1", already_pinned: false })));
    const res = await post({ teamId: "mt", entryId: "mem_1" });
    expect(runJigga).toHaveBeenCalledWith(["team", "memory", "pin", "mt", "mem_1", "--json"]);
    await expect(res.json()).resolves.toMatchObject({ already_pinned: false });
  });

  it("passes core's already_pinned through untouched", async () => {
    // The UI shows "Already pinned" rather than claiming it did something.
    runJigga.mockResolvedValue(ok(JSON.stringify({ id: "mem_1", already_pinned: true })));
    const res = await post({ teamId: "mt", entryId: "mem_1" });
    await expect(res.json()).resolves.toMatchObject({ already_pinned: true });
  });

  it("reports a failed pin as an error, not a success", async () => {
    runJigga.mockResolvedValue({ ok: false, exitCode: 1, stdout: "", stderr: "No memory entry matching 'nope'" });
    const res = await post({ teamId: "mt", entryId: "nope" });
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "No memory entry matching 'nope'" });
  });
});
