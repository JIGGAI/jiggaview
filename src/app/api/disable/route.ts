import { NextResponse } from "next/server";
import { runJigga } from "@/lib/jigga-cli";

const BASE: Record<string, string[]> = { agent: ["agents"], team: ["team"] };

/** POST {kind, id, disabled} → `jigga agents|team disable|enable` — the
 * lossless pause: one config flag, supervisor stops/starts waking. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    kind?: string; id?: string; disabled?: boolean;
  };
  const base = BASE[String(body.kind ?? "")];
  const id = String(body.id ?? "").trim();
  if (!base || !id || id.startsWith("-")) {
    return NextResponse.json({ error: "kind and id required" }, { status: 400 });
  }
  const verb = body.disabled ? "disable" : "enable";
  const res = await runJigga([...base, verb, id, "--json"]);
  if (!res.ok) {
    return NextResponse.json({ error: res.stderr.trim() || res.stdout.trim() || `${verb} failed` }, { status: 500 });
  }
  try {
    return NextResponse.json(JSON.parse(res.stdout));
  } catch {
    return NextResponse.json({ ok: true });
  }
}
