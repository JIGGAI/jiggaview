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
  actions?: Array<{ kind?: string; detail?: { record?: string; path?: string } }>;
};

export type PendingPaths = Record<string, string[]>;

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
function pendingRecipePaths(recipes: Recipe[], installed: InstalledRecord[], plan: UpdatePlan): PendingPaths {
  // scaffold_id -> the artifact paths Apply would write for it
  const pathsByScaffold = new Map<string, Set<string>>();
  for (const a of plan.actions ?? []) {
    const record = a.detail?.record;
    if (String(a.kind ?? "").startsWith("artifact.") && record) {
      const set = pathsByScaffold.get(record) ?? new Set<string>();
      if (a.detail?.path) set.add(String(a.detail.path));
      pathsByScaffold.set(record, set);
    }
  }
  const recipeIds = new Set(recipes.map((r) => r.id));
  const out: PendingPaths = {};
  for (const r of installed) {
    const paths = pathsByScaffold.get(r.scaffold_id);
    if (paths && r.recipe_id && recipeIds.has(r.recipe_id)) {
      out[r.recipe_id] = [...new Set([...(out[r.recipe_id] ?? []), ...paths])].sort();
    }
  }
  return out;
}

export default async function RecipesPage() {
  let recipes: Recipe[] = [];
  let installed: InstalledRecord[] = [];
  let pendingPaths: PendingPaths = {};
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
    pendingPaths = pendingRecipePaths(recipes, installed, plan);
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
      <RecipesClient recipes={recipes} installed={installed} pendingPaths={pendingPaths} />
    </div>
  );
}
