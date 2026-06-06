import { NextResponse } from "next/server";
import { runJigga } from "@/lib/jigga-cli";

/** GET ?name= → raw recipe markdown; PUT {name, content} → `jigga recipes
 * save` (user dir overrides bundled; validated + rolled back in core). */
export async function GET(request: Request) {
  const name = (new URL(request.url).searchParams.get("name") ?? "").trim();
  if (!name || name.startsWith("-")) {
    return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });
  }
  const res = await runJigga(["recipes", "cat", name]);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.stdout.trim() || res.stderr.trim() }, { status: 404 });
  return NextResponse.json({ ok: true, content: res.stdout });
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { name?: string; content?: string };
  const name = String(body.name ?? "").trim();
  if (!name || name.startsWith("-")) {
    return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });
  }
  const res = await runJigga(["recipes", "save", name, "--content", String(body.content ?? ""), "--json"]);
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: res.stderr.trim() || res.stdout.trim() || "save failed" },
      { status: 500 },
    );
  }
  try {
    return NextResponse.json({ ok: true, ...JSON.parse(res.stdout) });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
