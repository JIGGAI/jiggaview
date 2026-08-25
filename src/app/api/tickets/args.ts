import { NextResponse } from "next/server";
import type { JiggaResult } from "@/lib/jigga-cli";

/** `--name=value` rather than `--name value`.
 *
 * Ticket titles and descriptions are free text, and a title that happens to
 * start with a dash is a legitimate title — with the two-argv form argparse
 * would read it as an option and the create would fail with a parse error the
 * user could not act on. The `=` form binds the value to the flag whatever it
 * starts with, so no input needs to be rejected for looking like a flag.
 */
export function flag(name: string, value: string): string {
  return `--${name}=${value}`;
}

/** Task ids come from core as `task_<hex>`. A positional argument cannot use
 * the `=` trick, so this is checked rather than escaped. */
export function isTaskId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
}

/** Turn a failed `jigga` invocation into a response.
 *
 * Core prints its own error as JSON on stdout for `--json` commands and as
 * plain text otherwise; prefer the parsed message so the board shows what core
 * said rather than an exit code. A gated-lane refusal is the caller's problem
 * to fix (by naming an actor), so it is a 409 rather than a 500.
 */
export function fail(res: JiggaResult) {
  let message = res.stdout.trim() || res.stderr.trim() || `command failed (exit=${res.exitCode})`;
  try {
    const parsed = JSON.parse(res.stdout) as { error?: string };
    if (parsed.error) message = parsed.error;
  } catch {
    // non-JSON stdout — keep the raw message
  }
  const status = /gated by|not found/i.test(message) ? 409 : 500;
  return NextResponse.json({ error: message }, { status });
}
