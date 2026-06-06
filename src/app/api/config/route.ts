import { NextResponse } from "next/server";
import { runJigga } from "@/lib/jigga-cli";

/** POST {key, value} → `jigga config set <key> <value> --json` (audited in
 * the runtime as config.changed, like any CLI edit). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { key?: string; value?: string };
  const key = String(body.key ?? "").trim();
  const value = String(body.value ?? "");
  if (!key || key.startsWith("-")) {
    return NextResponse.json({ error: "config key required" }, { status: 400 });
  }
  const res = await runJigga(["config", "set", key, value, "--json"]);
  if (!res.ok) {
    return NextResponse.json(
      { error: res.stderr.trim() || res.stdout.trim() || `config set failed (exit=${res.exitCode})` },
      { status: 500 },
    );
  }
  try {
    return NextResponse.json(JSON.parse(res.stdout));
  } catch {
    return NextResponse.json({ ok: true });
  }
}
