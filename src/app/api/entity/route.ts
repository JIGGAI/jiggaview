import { NextResponse } from "next/server";
import { runJigga } from "@/lib/jigga-cli";

const KINDS: Record<string, string[]> = { team: ["team"], agent: ["agents"] };

/** POST {kind: "team"|"agent", id, key, value} → `jigga team|agents set …`
 * (validated + rolled-back in core on a breaking value; audited). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    kind?: string; id?: string; key?: string; value?: string;
  };
  const base = KINDS[String(body.kind ?? "")];
  const id = String(body.id ?? "").trim();
  const key = String(body.key ?? "").trim();
  if (!base || !id || !key || id.startsWith("-") || key.startsWith("-")) {
    return NextResponse.json({ error: "kind, id and key required" }, { status: 400 });
  }
  const wantRecipe = body.kind === "agent" && (body as { viaRecipe?: boolean }).viaRecipe !== false;
  let res = wantRecipe
    ? await runJigga([...base, "set", id, key, String(body.value ?? ""), "--recipe", "--json"])
    : await runJigga([...base, "set", id, key, String(body.value ?? ""), "--json"]);
  if (!res.ok && wantRecipe && (res.stdout + res.stderr).includes("not recipe-managed")) {
    res = await runJigga([...base, "set", id, key, String(body.value ?? ""), "--json"]);
  }
  if (!res.ok) {
    return NextResponse.json(
      { error: res.stderr.trim() || res.stdout.trim() || `set failed (exit=${res.exitCode})` },
      { status: 500 },
    );
  }
  try {
    return NextResponse.json(JSON.parse(res.stdout));
  } catch {
    return NextResponse.json({ ok: true });
  }
}
