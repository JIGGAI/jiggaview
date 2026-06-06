"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { fetchJson } from "@/lib/fetch-json";
import type { InstalledRecord, Recipe } from "./page";

function recipeStem(source: string): string {
  const file = source.split("/").pop() ?? source;
  return file.replace(/\.md$/, "");
}

export default function RecipesClient({
  recipes,
  installed,
}: {
  recipes: Recipe[];
  installed: InstalledRecord[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Recipe | null>(null);
  const [uninstallToo, setUninstallToo] = useState(false);
  const byRecipeId = new Map(installed.map((r) => [r.recipe_id, r]));

  async function deleteRecipe() {
    if (!deleting) return;
    setBusy(deleting.id);
    setMessage(null);
    try {
      await fetchJson("/api/recipes/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: recipeStem(deleting.source), uninstall: uninstallToo }),
      });
      setMessage(uninstallToo
        ? `Deleted ${deleting.name} and uninstalled what it created (backups in state/backups/).`
        : `Deleted the user copy of ${deleting.name} (backed up; bundled version takes over if any).`);
      setDeleting(null);
      setUninstallToo(false);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
      setDeleting(null);
    } finally {
      setBusy(null);
    }
  }

  async function scaffold(recipe: Recipe) {
    setBusy(recipe.id);
    setMessage(null);
    try {
      await fetchJson("/api/recipes/scaffold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: recipe.id }),
      });
      setMessage(`Scaffolded ${recipe.name}.`);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6">
      {message ? <p className="mb-3 text-sm text-[color:var(--ck-text-secondary)]">{message}</p> : null}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {recipes.map((recipe) => {
          const record = byRecipeId.get(recipe.id);
          const drift = (record?.modified?.length ?? 0) + (record?.missing?.length ?? 0);
          return (
            <li
              key={recipe.id}
              className="flex flex-col rounded-xl border border-[color:var(--ck-border-subtle)] bg-white/5 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{recipe.name}</div>
                  <div className="text-xs text-[color:var(--ck-text-tertiary)]">
                    {recipe.kind} · {recipe.id}
                  </div>
                </div>
                {recipe.installed ? (
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">
                    installed
                  </span>
                ) : null}
              </div>
              {recipe.description ? (
                <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">{recipe.description}</p>
              ) : null}
              {record && drift > 0 ? (
                <p className="mt-2 text-xs text-amber-400">
                  {record.modified?.length ? `${record.modified.length} locally edited` : null}
                  {record.modified?.length && record.missing?.length ? " · " : null}
                  {record.missing?.length ? `${record.missing.length} missing` : null}
                  {" — reconcile with "}
                  <code>jigga update</code>
                </p>
              ) : null}
              <div className="mt-auto flex gap-2 pt-3">
                <button
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/15 disabled:opacity-50"
                  disabled={busy !== null}
                  onClick={() => scaffold(recipe)}
                >
                  {busy === recipe.id ? "Scaffolding…" : recipe.installed ? "Sync (safe re-scaffold)" : "Install"}
                </button>
                <button
                  className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                  disabled={busy !== null}
                  onClick={() => setDeleting(recipe)}
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {deleting ? (
        <ConfirmationModal
          open
          title={`Delete recipe: ${deleting.name}`}
          onClose={() => { setDeleting(null); setUninstallToo(false); }}
          onConfirm={() => void deleteRecipe()}
          confirmLabel="Delete"
          busy={busy !== null}
        >
          <p className="text-sm text-[color:var(--ck-text-secondary)]">
            Removes your user-dir copy (backed up to state/backups/). A bundled version, if any, takes over.
          </p>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={uninstallToo} onChange={(e) => setUninstallToo(e.target.checked)} />
            Also uninstall what it installed (team/agents/workflows it owns — backed up)
          </label>
        </ConfirmationModal>
      ) : null}
    </div>
  );
}
