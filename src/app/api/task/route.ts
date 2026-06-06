import { NextResponse } from "next/server";
import { runJigga } from "@/lib/jigga-cli";

/** POST {title, assignee, description?} → `jigga task create` — queues work;
 * the supervisor executes (the UI never runs agents itself). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    title?: string; assignee?: string; description?: string;
  };
  const title = String(body.title ?? "").trim();
  const assignee = String(body.assignee ?? "").trim();
  if (!title || !assignee || assignee.startsWith("-")) {
    return NextResponse.json({ ok: false, error: "title and assignee required" }, { status: 400 });
  }
  const args = ["task", "create", "--title", title, "--assignee", assignee];
  if (body.description) args.push("--description", String(body.description));
  const res = await runJigga(args);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.stderr.trim() }, { status: 500 });
  try {
    return NextResponse.json({ ok: true, task: JSON.parse(res.stdout) });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
