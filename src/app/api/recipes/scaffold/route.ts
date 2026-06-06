import { NextResponse } from "next/server";
import { runJigga } from "@/lib/jigga-cli";

/** POST {name, id?, overwrite?} → `jigga recipes scaffold`. Plain installs are
 * create-only; overwrite=true is the team editor's Publish (re-scaffold the
 * team from its recipe). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    name?: string; id?: string; overwrite?: boolean;
  };
  const name = String(body.name ?? "").trim();
  if (!name || name.startsWith("-")) {
    return NextResponse.json({ error: "recipe name required" }, { status: 400 });
  }
  const args = ["recipes", "scaffold", name, "--json"];
  if (body.id && !String(body.id).startsWith("-")) args.push("--id", String(body.id));
  if (body.overwrite) args.push("--overwrite");
  const res = await runJigga(args);
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
