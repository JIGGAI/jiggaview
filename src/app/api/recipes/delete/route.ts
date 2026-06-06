import { NextResponse } from "next/server";
import { runJigga } from "@/lib/jigga-cli";

/** POST {name, uninstall?} → `jigga recipes delete` — removes the user-dir
 * copy (backed up; bundled takes over); uninstall also tears down what the
 * recipe installed (record-owned only, backed up). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { name?: string; uninstall?: boolean };
  const name = String(body.name ?? "").trim();
  if (!name || name.startsWith("-")) {
    return NextResponse.json({ error: "recipe name required" }, { status: 400 });
  }
  const args = ["recipes", "delete", name, "--json"];
  if (body.uninstall) args.push("--uninstall");
  const res = await runJigga(args);
  if (!res.ok) {
    return NextResponse.json({ error: res.stderr.trim() || res.stdout.trim() || "delete failed" }, { status: 500 });
  }
  try {
    return NextResponse.json(JSON.parse(res.stdout));
  } catch {
    return NextResponse.json({ ok: true });
  }
}
