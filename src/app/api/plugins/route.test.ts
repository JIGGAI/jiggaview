import { describe, expect, it, vi, beforeEach } from "vitest";

/** Plugins are supervised services, and this dashboard is one of them — so the
 * interesting cases are about what the route refuses to do, not what it lists.
 */

const runJigga = vi.fn();
const runJiggaJson = vi.fn();

vi.mock("@/lib/jigga-cli", () => ({
  runJigga: (args: string[]) => runJigga(args),
  runJiggaJson: (args: string[]) => runJiggaJson(args),
}));

const { GET, POST } = await import("./route");

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/plugins", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  runJigga.mockReset();
  runJiggaJson.mockReset();
  runJigga.mockResolvedValue({ ok: true, exitCode: 0, stdout: "{}", stderr: "" });
  runJiggaJson.mockResolvedValue([
    { name: "jiggaview", version: "0.1.0", port: 4400, running: true, installed_service: true },
  ]);
});

it("lists installed plugins with their service state", async () => {
  const body = (await (await GET()).json()) as { plugins: { name: string; running: boolean }[] };
  expect(runJiggaJson).toHaveBeenCalledWith(["plugins", "list", "--json"]);
  expect(body.plugins[0]).toMatchObject({ name: "jiggaview", running: true });
});

it("reports a failure instead of an empty list", async () => {
  // "No plugins" and "could not ask" are different answers, and only one of
  // them means you should go install something.
  runJiggaJson.mockRejectedValue(new Error("jigga not on PATH"));
  const res = await GET();
  expect(res.status).toBe(500);
  await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining("PATH") });
});

describe("service control", () => {
  it("starts a plugin", async () => {
    await post({ name: "jiggaview", action: "start" });
    expect(runJigga).toHaveBeenCalledWith(["plugins", "start", "jiggaview", "--json"]);
  });

  it("stops a plugin", async () => {
    await post({ name: "jiggaview", action: "stop" });
    expect(runJigga).toHaveBeenCalledWith(["plugins", "stop", "jiggaview", "--json"]);
  });

  it("accepts nothing but start and stop", async () => {
    // install runs a third party's setup commands and records an approval;
    // uninstall deletes the directory. Neither belongs behind a dashboard
    // button — least of all one the plugin itself might be serving.
    for (const action of ["install", "uninstall", "restart", ""]) {
      const res = await post({ name: "jiggaview", action });
      expect(res.status).toBe(400);
    }
    expect(runJigga).not.toHaveBeenCalled();
  });

  it("rejects a flag-shaped name before shelling out", async () => {
    const res = await post({ name: "--home", action: "stop" });
    expect(res.status).toBe(400);
    expect(runJigga).not.toHaveBeenCalled();
  });

  it("surfaces the CLI's error", async () => {
    runJigga.mockResolvedValue({ ok: false, exitCode: 1, stdout: "", stderr: "no such plugin" });
    const res = await post({ name: "ghost", action: "start" });
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "no such plugin" });
  });
});
