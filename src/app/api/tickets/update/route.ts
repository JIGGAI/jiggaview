import { NextResponse } from "next/server";
import { runJigga } from "@/lib/jigga-cli";
import { fail, flag, isTaskId } from "../args";

/** POST {task, title?, description?, assignee?, as?} → `jigga task update`.
 *
 * Only the fields present in the body are sent, because core treats an omitted
 * flag as "leave alone" — sending every field would overwrite a description
 * someone edited from another tab with whatever this form last rendered.
 *
 * An empty-string `assignee` is meaningful (it clears the assignee) so it is
 * forwarded, unlike the create route where empty means "not set".
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const task = String(body.task ?? "").trim();
  if (!task) return NextResponse.json({ error: "task required" }, { status: 400 });
  if (!isTaskId(task)) return NextResponse.json({ error: "invalid task id" }, { status: 400 });

  const args = ["task", "update", task];
  let edits = 0;
  for (const name of ["title", "description", "assignee"] as const) {
    if (typeof body[name] !== "string") continue;
    args.push(flag(name, String(body[name])));
    edits += 1;
  }
  if (!edits) {
    return NextResponse.json(
      { error: "nothing to update: pass title, description or assignee" },
      { status: 400 },
    );
  }
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
