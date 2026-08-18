/**
 * The jiggaview ↔ JIGGA boundary: shell out to the `jigga` CLI with `--json`
 * and parse stdout. CLI-as-API by design — the UI never reads or writes
 * `~/.jigga` state through its own logic; every read and mutation goes through
 * the same audited, policy-gated commands a human would run. The supervisor
 * executes; jiggaview only queues and renders.
 */
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type JiggaResult = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
};

const JIGGA_BIN = process.env.JIGGA_BIN || "jigga";
const TIMEOUT_MS = 120_000;

export async function runJigga(args: string[]): Promise<JiggaResult> {
  try {
    const res = await execFileAsync(JIGGA_BIN, args, {
      timeout: TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      env: process.env,
    });
    return { ok: true, exitCode: 0, stdout: String(res.stdout ?? ""), stderr: String(res.stderr ?? "") };
  } catch (e: unknown) {
    const err = e as { code?: unknown; stdout?: unknown; stderr?: unknown };
    return {
      ok: false,
      exitCode: typeof err.code === "number" ? err.code : 1,
      stdout: String(err.stdout ?? ""),
      stderr: String(err.stderr ?? ""),
    };
  }
}

/** Run a jigga command with `input` on STDIN.
 *
 * Not a convenience: the alternative is passing the body as an argv value, and
 * argv is world-readable through /proc on the machine this runs on. A workflow
 * artifact is a deliverable — a draft, a summary, whatever the run produced —
 * and it has no business showing up in `ps` for every other account on the box.
 */
export async function runJiggaWithInput(args: string[], input: string): Promise<JiggaResult> {
  return new Promise((resolve) => {
    const child = spawn(JIGGA_BIN, args, { env: process.env, timeout: TIMEOUT_MS });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    // The child may exit (or refuse) before draining stdin; that surfaces as
    // EPIPE on the write, which is the command's own failure to report, not a
    // crash of the server handling the request.
    child.stdin.on("error", () => {});
    child.on("error", (err) => resolve({ ok: false, exitCode: 1, stdout, stderr: String(err.message) }));
    child.on("close", (code) => resolve({ ok: code === 0, exitCode: code ?? 1, stdout, stderr }));
    child.stdin.end(input);
  });
}

/** The most useful sentence a failed command produced.
 *
 * Under `--json`, core reports a refusal as JSON on STDOUT with a non-zero exit
 * ("No workspace for 'ghost'. Run: jigga team init ghost") and leaves stderr
 * empty. Reading only stderr threw that away and showed the caller a generic
 * "failed (exit=1)" — the exact case a person needs the real sentence for.
 */
function failureMessage(args: string[], res: JiggaResult): string {
  if (res.stderr.trim()) return res.stderr.trim();
  const stdout = res.stdout.trim();
  if (stdout) {
    try {
      const parsed = JSON.parse(stdout) as { error?: unknown };
      if (typeof parsed.error === "string" && parsed.error) return parsed.error;
    } catch {
      return stdout; // not JSON — a plain message is still better than nothing
    }
  }
  return `jigga ${args.join(" ")} failed (exit=${res.exitCode})`;
}

/** Run a jigga command and parse its --json stdout. Throws a readable error on failure. */
export async function runJiggaJson<T>(args: string[]): Promise<T> {
  const res = await runJigga(args);
  if (!res.ok) {
    throw new Error(failureMessage(args, res));
  }
  try {
    return JSON.parse(res.stdout) as T;
  } catch {
    throw new Error(`jigga ${args.join(" ")} returned non-JSON output`);
  }
}
