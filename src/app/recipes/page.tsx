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

export default async function RecipesPage() {
  let recipes: Recipe[] = [];
  let installed: InstalledRecord[] = [];
  let error: string | null = null;
  try {
    [recipes, installed] = await Promise.all([
      runJiggaJson<Recipe[]>(["recipes", "list", "--json"]),
      runJiggaJson<InstalledRecord[]>(["recipes", "installed", "--json"]),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-semibold">Recipes</h1>
      <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
        Scaffoldable agent &amp; team templates — JIGGA&apos;s install format.
      </p>
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      <RecipesClient recipes={recipes} installed={installed} />
    </div>
  );
}
