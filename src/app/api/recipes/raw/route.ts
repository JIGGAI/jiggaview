import { NextResponse } from "next/server";
import { runJigga, runJiggaWithInput } from "@/lib/jigga-cli";

/** GET ?name=[&bundled=1] → raw recipe markdown (your copy, or the shipped
 * default with bundled=1 — for diffing against a new release);
 * PUT {name, content} → `jigga recipes save` (user dir overrides bundled;
 * validated + rolled back in core). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = (url.searchParams.get("name") ?? "").trim();
  const bundled = url.searchParams.get("bundled") === "1";
  if (!name || name.startsWith("-")) {
    return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });
  }
  const res = await runJigga(["recipes", "cat", name, ...(bundled ? ["--bundled"] : [])]);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.stdout.trim() || res.stderr.trim() }, { status: 404 });
  return NextResponse.json({ ok: true, content: res.stdout });
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { name?: string; content?: string };
  const name = String(body.name ?? "").trim();
  if (!name || name.startsWith("-")) {
    return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });
  }
  const res = await runJiggaWithInput(["recipes", "save", name, "--json"],
                                      String(body.content ?? ""));
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
