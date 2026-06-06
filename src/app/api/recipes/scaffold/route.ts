import { NextResponse } from "next/server";
import { runJigga } from "@/lib/jigga-cli";

/** POST {name} → `jigga recipes scaffold <name> --json`. Create-only by
 * design — re-scaffolding never clobbers user edits (that's `jigga update`'s
 * job, with its picker + backups). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const name = String(body.name ?? "").trim();
  if (!name || name.startsWith("-")) {
    return NextResponse.json({ error: "recipe name required" }, { status: 400 });
  }
  const res = await runJigga(["recipes", "scaffold", name, "--json"]);
  if (!res.ok) {
    return NextResponse.json(
      { error: res.stderr.trim() || `scaffold failed (exit=${res.exitCode})` },
      { status: 500 },
    );
  }
  try {
    return NextResponse.json(JSON.parse(res.stdout));
  } catch {
    return NextResponse.json({ ok: true });
  }
}
