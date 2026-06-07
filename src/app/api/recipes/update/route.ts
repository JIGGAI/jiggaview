import { NextResponse } from "next/server";
import { runJigga } from "@/lib/jigga-cli";

/** POST → `jigga update --apply` — reconcile the live runtime with the current
 * recipes (re-scaffold artifacts whose recipe changed, refresh config + the
 * supervisor unit). This is the recipes page's "Apply" button: after you edit
 * and save a recipe, applying folds that change into the running system.
 *
 * `--apply` is non-interactive and never auto-replaces files you've locally
 * edited (those stay as notices); it applies the pristine/derived changes. */
export async function POST() {
  const res = await runJigga(["update", "--apply", "--json"]);
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: res.stderr.trim() || res.stdout.trim() || `update failed (exit=${res.exitCode})` },
      { status: 500 },
    );
  }
  // `--apply` with nothing to do prints a plain "Nothing to apply." line rather
  // than JSON — that's still success, just no structured plan to surface.
  try {
    return NextResponse.json({ ok: true, ...JSON.parse(res.stdout) });
  } catch {
    return NextResponse.json({ ok: true, message: res.stdout.trim() || "Up to date." });
  }
}
