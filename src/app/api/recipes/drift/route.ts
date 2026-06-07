import { NextResponse } from "next/server";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { runJigga, runJiggaJson } from "@/lib/jigga-cli";

/** GET ?recipe=<recipeId> → per-artifact before/after for everything this recipe
 * would change if reconciled: the live file (`before`) vs what the recipe now
 * generates (`after`). Both are re-serialized with sorted keys so the diff
 * reflects real value changes, not YAML formatting / key-order noise.
 *
 * Sources: `jigga update --dry-run` carries the regenerated `content` for
 * pristine-but-changed artifacts (actions) and for files you edited that the
 * recipe also changed (edited). We pair each with the live agent yaml. */

type PlanItem = { path: string; content: string; kind: "pending" | "edited" };

type UpdatePlan = {
  actions?: Array<{ kind?: string; detail?: { record?: string; path?: string; content?: string } }>;
  edited?: Array<{ record?: string; recipe?: string; path?: string; content?: string }>;
};

type InstalledRecord = { recipe_id?: string; scaffold_id?: string };

function canonical(text: string): string {
  try {
    return stringifyYaml(parseYaml(text) ?? {}, { sortMapEntries: true });
  } catch {
    return text; // un-parseable (mid-edit / unusual) → show as-is rather than drop it
  }
}

/** The live artifact, re-serialized canonically. Only agents/<id>.yaml is
 * readable through the CLI today; other artifact kinds return "" (no before). */
async function liveBefore(path: string): Promise<string> {
  const match = /^agents\/(.+)\.yaml$/.exec(path);
  if (!match) return "";
  const res = await runJigga(["agents", "get", match[1], "--json"]);
  if (!res.ok) return "";
  try {
    return stringifyYaml(JSON.parse(res.stdout), { sortMapEntries: true });
  } catch {
    return "";
  }
}

export async function GET(request: Request) {
  const recipeId = (new URL(request.url).searchParams.get("recipe") ?? "").trim();
  if (!recipeId || recipeId.startsWith("-")) {
    return NextResponse.json({ ok: false, error: "recipe required" }, { status: 400 });
  }

  let plan: UpdatePlan = {};
  let installed: InstalledRecord[] = [];
  try {
    [plan, installed] = await Promise.all([
      runJiggaJson<UpdatePlan>(["update", "--dry-run", "--json"]).catch(() => ({}) as UpdatePlan),
      runJiggaJson<InstalledRecord[]>(["recipes", "installed", "--json"]).catch(() => []),
    ]);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  const scaffoldIds = new Set(
    installed.filter((r) => r.recipe_id === recipeId).map((r) => r.scaffold_id),
  );

  const planItems: PlanItem[] = [];
  for (const a of plan.actions ?? []) {
    if (String(a.kind ?? "").startsWith("artifact.") && a.detail?.path && a.detail.content !== undefined
        && scaffoldIds.has(a.detail.record)) {
      planItems.push({ path: a.detail.path, content: a.detail.content, kind: "pending" });
    }
  }
  for (const e of plan.edited ?? []) {
    if (e.path && e.content !== undefined && scaffoldIds.has(e.record)) {
      planItems.push({ path: e.path, content: e.content, kind: "edited" });
    }
  }

  const items = await Promise.all(
    planItems.map(async (it) => ({
      path: it.path,
      kind: it.kind,
      before: await liveBefore(it.path),
      after: canonical(it.content),
    })),
  );

  return NextResponse.json({ ok: true, items });
}
