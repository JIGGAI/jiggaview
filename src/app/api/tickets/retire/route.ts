import { NextResponse } from "next/server";
import { runJigga } from "@/lib/jigga-cli";
import { fail, flag, isTaskId } from "../args";

/** POST {task, action: "archive" | "delete", as?} → `jigga task archive|delete`.
 *
 * One route for both verbs rather than two near-identical files: the argv and
 * the failure handling are the same, and the difference that matters is a
 * property of the request, not of the endpoint.
 *
 * `action` has no default. Archiving and deleting are different decisions —
 * one is recoverable and one is not — so a caller that forgets to say which it
 * meant gets a 400, not a guess.
 */
const ACTIONS = new Set(["archive", "delete"]);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const task = String(body.task ?? "").trim();
  const action = String(body.action ?? "").trim();
  if (!task) return NextResponse.json({ error: "task required" }, { status: 400 });
  if (!isTaskId(task)) return NextResponse.json({ error: "invalid task id" }, { status: 400 });
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ error: "action must be 'archive' or 'delete'" }, { status: 400 });
  }

  const args = ["task", action, task];
  const as = typeof body.as === "string" ? body.as.trim() : "";
  if (as) args.push(flag("as", as));
  args.push("--json");

  const res = await runJigga(args);
  if (!res.ok) return fail(res);
  try {
    return NextResponse.json(JSON.parse(res.stdout));
  } catch {
    return NextResponse.json({ ok: true });
  }
}
