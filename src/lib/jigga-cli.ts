/**
 * The jiggaview ↔ JIGGA boundary: shell out to the `jigga` CLI with `--json`
 * and parse stdout. CLI-as-API by design — the UI never reads or writes
 * `~/.jigga` state through its own logic; every read and mutation goes through
 * the same audited, policy-gated commands a human would run. The supervisor
 * executes; jiggaview only queues and renders.
 */
import { execFile } from "node:child_process";
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

/** Run a jigga command and parse its --json stdout. Throws a readable error on failure. */
export async function runJiggaJson<T>(args: string[]): Promise<T> {
  const res = await runJigga(args);
  if (!res.ok) {
    throw new Error(res.stderr.trim() || `jigga ${args.join(" ")} failed (exit=${res.exitCode})`);
  }
  try {
    return JSON.parse(res.stdout) as T;
  } catch {
    throw new Error(`jigga ${args.join(" ")} returned non-JSON output`);
  }
}
