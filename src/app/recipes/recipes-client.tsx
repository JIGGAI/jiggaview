"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { Modal } from "@/components/Modal";
import { fetchJson } from "@/lib/fetch-json";
import type { InstalledRecord, Recipe } from "./page";
import { parseRecipeFrontmatter, RecipeInfoPanel, RecipeChangeDiff } from "./recipe-editor-panel";

function recipeStem(source: string): string {
  const file = source.split("/").pop() ?? source;
  return file.replace(/\.md$/, "");
}

const BTN = "rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/15 disabled:opacity-50";

function DriftStatus({ record }: { record: InstalledRecord | undefined }) {
  const modified = record?.modified?.length ?? 0;
  const missing = record?.missing?.length ?? 0;
  if (modified + missing === 0) return null;
  const parts: React.ReactNode[] = [];
  if (missing) {
    parts.push(
      <span key="missing">
        {missing} missing — <strong>Repair</strong> recreates {missing === 1 ? "it" : "them"}.{" "}
      </span>,
    );
  }
  if (modified) {
    parts.push(
      <span key="edited">
        {modified} locally edited — kept; <code>jigga update</code>’s picker overwrites only if you choose.
      </span>,
    );
  }
  return <p className="mt-2 text-xs text-amber-400">{parts}</p>;
}

function RecipeCard({
  recipe,
  record,
  isPending,
  busy,
  onEdit,
  onScaffold,
  onApply,
  onDelete,
}: {
  recipe: Recipe;
  record: InstalledRecord | undefined;
  isPending: boolean;
  busy: string | null;
  onEdit: (r: Recipe) => void;
  onScaffold: (r: Recipe) => void;
  onApply: () => void;
  onDelete: (r: Recipe) => void;
}) {
  const hasMissing = (record?.missing?.length ?? 0) > 0;

  return (
    <li
      className={`flex flex-col rounded-xl border bg-white/5 p-4 ${
        isPending ? "border-amber-400/60 ring-1 ring-amber-400/30" : "border-[color:var(--ck-border-subtle)]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium">{recipe.name}</div>
          <div className="text-xs text-[color:var(--ck-text-tertiary)]">
            {recipe.kind} · {recipe.id}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isPending ? (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">pending apply</span>
          ) : null}
          {recipe.installed ? (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">installed</span>
          ) : null}
        </div>
      </div>
      {recipe.description ? (
        <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">{recipe.description}</p>
      ) : null}
      {isPending ? (
        <p className="mt-2 text-xs text-amber-400">
          Edited but not applied — <strong>Apply</strong> to reconcile the running system (and restart the supervisor).
        </p>
      ) : (
        <DriftStatus record={record} />
      )}
      <CardActions
        recipe={recipe}
        isPending={isPending}
        hasMissing={hasMissing}
        busy={busy}
        onEdit={onEdit}
        onScaffold={onScaffold}
        onApply={onApply}
        onDelete={onDelete}
      />
    </li>
  );
}

function CardActions({
  recipe,
  isPending,
  hasMissing,
  busy,
  onEdit,
  onScaffold,
  onApply,
  onDelete,
}: {
  recipe: Recipe;
  isPending: boolean;
  hasMissing: boolean;
  busy: string | null;
  onEdit: (r: Recipe) => void;
  onScaffold: (r: Recipe) => void;
  onApply: () => void;
  onDelete: (r: Recipe) => void;
}) {
  const disabled = busy !== null;
  return (
    <div className="mt-auto flex flex-wrap gap-2 pt-3">
      <button className={BTN} disabled={disabled} onClick={() => onEdit(recipe)}>
        Edit
      </button>

      {!recipe.installed ? (
        <button className={BTN} disabled={disabled} onClick={() => onScaffold(recipe)} title="Scaffold this recipe (agents, team, workflows, workspace)">
          {busy === recipe.id ? "Installing…" : "Install"}
        </button>
      ) : null}

      {recipe.installed && isPending ? (
        <button
          className="rounded-lg bg-amber-500/80 px-3 py-1.5 text-sm font-medium text-amber-950 hover:bg-amber-400 disabled:opacity-50"
          disabled={disabled}
          onClick={onApply}
          title="jigga update --apply: reconcile every recipe + restart the supervisor"
        >
          {busy === "__apply__" ? "Applying…" : "Apply"}
        </button>
      ) : null}

      {recipe.installed && !isPending && hasMissing ? (
        <button className={BTN} disabled={disabled} onClick={() => onScaffold(recipe)} title="Re-scaffold this recipe to recreate missing files (never overwrites your edits)">
          {busy === recipe.id ? "Repairing…" : "Repair"}
        </button>
      ) : null}

      {recipe.installed ? (
        <button
          className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-200 hover:bg-red-500/20 disabled:opacity-50"
          disabled={disabled}
          onClick={() => onDelete(recipe)}
        >
          Delete
        </button>
      ) : null}
    </div>
  );
}

export default function RecipesClient({
  recipes,
  installed,
  pending,
}: {
  recipes: Recipe[];
  installed: InstalledRecord[];
  pending: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Recipe | null>(null);
  const [uninstallToo, setUninstallToo] = useState(false);

  // Editor state — one recipe open at a time.
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [draft, setDraft] = useState("");
  const [original, setOriginal] = useState("");
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  const byRecipeId = new Map(installed.map((r) => [r.recipe_id, r]));
  const pendingSet = new Set(pending);
  const dirty = draft !== original;
  const parsed = useMemo(() => parseRecipeFrontmatter(draft), [draft]);

  async function openEditor(recipe: Recipe) {
    setEditing(recipe);
    setDraft("");
    setOriginal("");
    setEditorError(null);
    setEditorBusy(true);
    try {
      const res = await fetchJson<{ content?: string }>(
        `/api/recipes/raw?name=${encodeURIComponent(recipeStem(recipe.source))}`,
        { cache: "no-store" },
      );
      const content = res.content ?? "";
      setDraft(content);
      setOriginal(content);
    } catch (e) {
      setEditorError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditorBusy(false);
    }
  }

  function closeEditor() {
    setEditing(null);
    setDraft("");
    setOriginal("");
    setEditorError(null);
  }

  async function saveEditor() {
    if (!editing || !dirty) return;
    setEditorBusy(true);
    setEditorError(null);
    try {
      await fetchJson("/api/recipes/raw", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: recipeStem(editing.source), content: draft }),
      });
      setMessage(
        `Saved ${editing.name}. Apply your change with the Apply button (runs jigga update) to fold it into the running system.`,
      );
      closeEditor();
      router.refresh();
    } catch (e) {
      setEditorError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditorBusy(false);
    }
  }

  async function applyUpdate() {
    setBusy("__apply__");
    setMessage(null);
    try {
      const res = await fetchJson<{ message?: string }>("/api/recipes/update", { method: "POST" });
      setMessage(res.message ?? "Applied — the running system now matches your recipes.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

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

  const hasPending = pendingSet.size > 0;

  return (
    <div className="mt-6">
      {hasPending ? (
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-amber-200">
            {pendingSet.size} recipe{pendingSet.size === 1 ? "" : "s"} with unapplied changes — apply to reconcile the
            running system with your edits.
          </p>
          <button
            className="shrink-0 rounded-lg bg-amber-500/80 px-3 py-1.5 text-sm font-medium text-amber-950 hover:bg-amber-400 disabled:opacity-50"
            disabled={busy !== null}
            onClick={() => void applyUpdate()}
          >
            {busy === "__apply__" ? "Applying…" : "Apply (jigga update)"}
          </button>
        </div>
      ) : null}
      {message ? <p className="mb-3 text-sm text-[color:var(--ck-text-secondary)]">{message}</p> : null}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {recipes.map((recipe) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            record={byRecipeId.get(recipe.id)}
            isPending={pendingSet.has(recipe.id)}
            busy={busy}
            onEdit={(r) => void openEditor(r)}
            onScaffold={(r) => void scaffold(r)}
            onApply={() => void applyUpdate()}
            onDelete={(r) => setDeleting(r)}
          />
        ))}
      </ul>

      <Modal open={editing !== null} onClose={closeEditor} title={editing ? `Edit recipe: ${editing.name}` : "Edit recipe"} size="full">
        <div className="text-xs text-[color:var(--ck-text-tertiary)]">
          {editing ? <>{editing.kind} · <span className="font-mono">{recipeStem(editing.source)}</span> · <span className="font-mono">{editing.source}</span></> : null}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col">
            <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Recipe markdown</div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              disabled={editorBusy}
              placeholder={editorBusy ? "Loading…" : ""}
              className="mt-2 h-[52vh] w-full resize-none rounded-lg border border-white/10 bg-white/5 p-3 font-mono text-xs text-[color:var(--ck-text-primary)] placeholder:text-[color:var(--ck-text-tertiary)]"
            />
            <div className="mt-3">
              <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Changes</div>
              <div className="mt-2">
                <RecipeChangeDiff original={original} draft={draft} />
              </div>
            </div>
          </div>
          <div className="flex flex-col">
            <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Preview (from frontmatter)</div>
            <div className="mt-2 max-h-[78vh] overflow-auto pr-1">
              <RecipeInfoPanel fm={parsed.fm} error={parsed.error} />
            </div>
          </div>
        </div>
        {editorError ? (
          <div className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
            {editorError}
          </div>
        ) : null}
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className={`text-xs ${dirty ? "text-amber-300" : "text-[color:var(--ck-text-tertiary)]"}`}>
            {dirty ? "Unsaved changes" : "No changes"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeEditor}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!dirty || editorBusy}
              onClick={() => void saveEditor()}
              className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] hover:bg-[var(--ck-accent-red-hover)] disabled:opacity-50"
            >
              {editorBusy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-[color:var(--ck-text-tertiary)]">
          Save writes your copy to <code>~/.jigga/recipes</code> (overrides the bundled version). Then click{" "}
          <strong>Apply</strong> on the recipes page to run <code>jigga update</code> and fold the change into the
          running system.
        </p>
      </Modal>

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
