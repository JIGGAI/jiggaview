import { NextResponse } from "next/server";
import { runJigga } from "@/lib/jigga-cli";

/** POST {recipe, id, name?, overwrite?} → `jigga recipes create` — make a NEW
 * team/agent instance from a recipe (writes an editable user-dir copy under
 * `id` with instance-scoped agents, then scaffolds it). The core verb refuses a
 * duplicate id (exit 1) — surfaced as a 409 so the UI can suggest another. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    recipe?: string; id?: string; name?: string; overwrite?: boolean;
  };
  const recipe = String(body.recipe ?? "").trim();
  const id = String(body.id ?? "").trim();
  if (!recipe || recipe.startsWith("-")) {
    return NextResponse.json({ error: "recipe name required" }, { status: 400 });
  }
  if (!id || id.startsWith("-")) {
    return NextResponse.json({ error: "new id required" }, { status: 400 });
  }
  const args = ["recipes", "create", recipe, "--id", id, "--json"];
  if (body.name && String(body.name).trim()) args.push("--name", String(body.name).trim());
  if (body.overwrite) args.push("--overwrite");
  const res = await runJigga(args);
  if (!res.ok) {
    // The core prints {"error": "..."} on a handled failure (e.g. id taken).
    let message = res.stderr.trim() || res.stdout.trim() || `create failed (exit=${res.exitCode})`;
    try {
      const parsed = JSON.parse(res.stdout) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      // non-JSON stdout — keep the raw message
    }
    const status = /already exists/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
  try {
    return NextResponse.json(JSON.parse(res.stdout));
  } catch {
    return NextResponse.json({ ok: true });
  }
}
