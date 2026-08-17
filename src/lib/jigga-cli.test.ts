import { describe, expect, it, beforeAll } from "vitest";

/** The one integration boundary: everything jiggaview knows comes through
 * these two functions, so what they do with a FAILED command decides whether a
 * person sees why, or just "exit=1".
 *
 * These drive a real `/bin/sh` rather than a mocked `execFile`. The behaviour
 * under test IS the unwrapping of a rejected exec — its `code`, `stdout` and
 * `stderr` — and a hand-built fake of that shape would be asserting against my
 * own idea of it. `JIGGA_BIN` is the module's own escape hatch, read once at
 * import, so the import below is deliberately after the env is set.
 */

let runJigga: typeof import("./jigga-cli").runJigga;
let runJiggaJson: typeof import("./jigga-cli").runJiggaJson;

beforeAll(async () => {
  process.env.JIGGA_BIN = "/bin/sh";
  ({ runJigga, runJiggaJson } = await import("./jigga-cli"));
});

/** A shell command standing in for a jigga invocation. */
const sh = (script: string) => ["-c", script];

describe("runJigga", () => {
  it("reports success with stdout", async () => {
    await expect(runJigga(sh("echo hello"))).resolves.toMatchObject({
      ok: true,
      exitCode: 0,
      stdout: "hello\n",
    });
  });

  it("reports a failure instead of throwing", async () => {
    const res = await runJigga(sh("echo boom >&2; exit 2"));
    expect(res).toMatchObject({ ok: false, exitCode: 2 });
    expect(res.stderr.trim()).toBe("boom");
  });
});

describe("runJiggaJson", () => {
  it("parses --json stdout", async () => {
    await expect(runJiggaJson(sh(`echo '[{"id":"mt"}]'`))).resolves.toEqual([{ id: "mt" }]);
  });

  it("prefers stderr when there is one", async () => {
    await expect(runJiggaJson(sh("echo '{}' ; echo permission denied >&2; exit 1")))
      .rejects.toThrow("permission denied");
  });

  it("surfaces core's stdout JSON error when stderr is empty", async () => {
    // `team memory list ghost --json` exits 1 and puts the real explanation on
    // STDOUT. Reading only stderr showed "failed (exit=1)" — useless precisely
    // when the caller most needs the sentence.
    const script = `echo '{"team":"ghost","error":"No workspace for ghost. Run: jigga team init ghost"}'; exit 1`;
    await expect(runJiggaJson(sh(script)))
      .rejects.toThrow("No workspace for ghost. Run: jigga team init ghost");
  });

  it("falls back to plain stdout text when it is not JSON", async () => {
    await expect(runJiggaJson(sh(`echo "Recipe not found: 'nope'."; exit 1`)))
      .rejects.toThrow("Recipe not found: 'nope'.");
  });

  it("names the command when it said nothing at all", async () => {
    await expect(runJiggaJson(sh("exit 3"))).rejects.toThrow(/failed \(exit=3\)/);
  });

  it("reports non-JSON output on a SUCCESSFUL command as such", async () => {
    await expect(runJiggaJson(sh("echo not json"))).rejects.toThrow("returned non-JSON output");
  });
});
