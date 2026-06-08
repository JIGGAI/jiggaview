import { NextResponse } from "next/server";
import { runJigga } from "@/lib/jigga-cli";

/** POST {task, lane, as?} → `jigga task move <task> <lane> [--as <member>]`.
 * A lane's gate is enforced by core; a gated move with the wrong/absent actor
 * comes back as exit 1, surfaced here as 409 so the board can prompt for `as`. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { task?: string; lane?: string; as?: string };
  const task = String(body.task ?? "").trim();
  const lane = String(body.lane ?? "").trim();
  if (!task || task.startsWith("-") || !lane || lane.startsWith("-")) {
    return NextResponse.json({ error: "task and lane required" }, { status: 400 });
  }
  const args = ["task", "move", task, lane, "--json"];
  if (body.as && String(body.as).trim()) args.push("--as", String(body.as).trim());
  const res = await runJigga(args);
  if (!res.ok) {
    let message = res.stdout.trim() || res.stderr.trim() || `move failed (exit=${res.exitCode})`;
    try {
      const parsed = JSON.parse(res.stdout) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      // non-JSON stdout — keep the raw message
    }
    const status = /gated by/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
  try {
    return NextResponse.json(JSON.parse(res.stdout));
  } catch {
    return NextResponse.json({ ok: true });
  }
}
