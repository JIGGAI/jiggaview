import { NextResponse } from "next/server";
import { runJigga } from "@/lib/jigga-cli";
import { fail, flag } from "../args";

/** POST {team, title, description?, assignee?, lane?, as?} → `jigga task create`.
 *
 * Filing a ticket by hand. Core picks the team's default lane when `lane` is
 * omitted and rejects a lane the team does not declare, so this route validates
 * only what it must and lets the board surface core's message for the rest.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const team = String(body.team ?? "").trim();
  const title = String(body.title ?? "").trim();
  if (!team) return NextResponse.json({ error: "team required" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const args = ["task", "create", flag("team", team), flag("title", title), "--json"];
  for (const name of ["description", "assignee", "lane", "as"] as const) {
    const raw = body[name];
    const text = typeof raw === "string" ? raw.trim() : "";
    if (text) args.push(flag(name, text));
  }

  const res = await runJigga(args);
  if (!res.ok) return fail(res);
  try {
    return NextResponse.json(JSON.parse(res.stdout));
  } catch {
    return NextResponse.json({ ok: true });
  }
}
