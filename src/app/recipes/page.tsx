import { runJiggaJson } from "@/lib/jigga-cli";
import RecipesClient from "./recipes-client";

export const dynamic = "force-dynamic";

export type Recipe = {
  id: string;
  name: string;
  kind: "agent" | "team";
  description?: string | null;
  source: string;
  installed: boolean;
};

export type InstalledRecord = {
  recipe_id: string;
  scaffold_id: string;
  kind?: string;
  version?: string | null;
  installed_at?: string;
  artifacts?: string[];
  modified?: string[];
  missing?: string[];
};

type UpdatePlan = {
  actions?: Array<{ kind?: string; detail?: { record?: string } }>;
};

/** Recipes whose saved markdown no longer matches the live runtime AND that
 * `jigga update --apply` can reconcile non-interactively — i.e. a recipe edit
 * that hasn't been applied yet. Truth comes from `jigga update --dry-run`: each
 * `artifact.*` action names the scaffold that drifted; we map that back to the
 * recipe via the install records.
 *
 * Deliberately excludes the plan's `edited` entries (artifacts you hand-edited
 * after install). Those are surfaced by the existing "N locally edited" drift
 * line and `--apply` intentionally leaves them alone — so flagging them here
 * would promise an Apply that does nothing. */
function pendingRecipeIds(recipes: Recipe[], installed: InstalledRecord[], plan: UpdatePlan): string[] {
  const pendingScaffolds = new Set<string>();
  for (const a of plan.actions ?? []) {
    if (String(a.kind ?? "").startsWith("artifact.") && a.detail?.record) {
      pendingScaffolds.add(String(a.detail.record));
    }
  }
  const pendingRecipes = new Set<string>();
  for (const r of installed) {
    if (pendingScaffolds.has(r.scaffold_id) && r.recipe_id) pendingRecipes.add(r.recipe_id);
  }
  return recipes.filter((r) => pendingRecipes.has(r.id)).map((r) => r.id);
}

export default async function RecipesPage() {
  let recipes: Recipe[] = [];
  let installed: InstalledRecord[] = [];
  let pending: string[] = [];
  let error: string | null = null;
  try {
    const [recipesList, installedList, plan] = await Promise.all([
      runJiggaJson<Recipe[]>(["recipes", "list", "--json"]),
      runJiggaJson<InstalledRecord[]>(["recipes", "installed", "--json"]),
      // The plan is best-effort context for highlighting; a failure here (e.g.
      // no service installed) must not blank the page.
      runJiggaJson<UpdatePlan>(["update", "--dry-run", "--json"]).catch(() => ({}) as UpdatePlan),
    ]);
    recipes = recipesList;
    installed = installedList;
    pending = pendingRecipeIds(recipes, installed, plan);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="w-full">
      <h1 className="text-xl font-semibold">Recipes</h1>
      <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
        Scaffoldable agent &amp; team templates — JIGGA&apos;s install format.
      </p>
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      <RecipesClient recipes={recipes} installed={installed} pending={pending} />
    </div>
  );
}
