"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { Modal } from "@/components/Modal";
import { fetchJson } from "@/lib/fetch-json";
import type { InstalledRecord, PendingPaths, Recipe } from "./page";
import { normalizeRecipe, parseRecipeFrontmatter, RecipeInfoPanel, RecipeChangeDiff } from "./recipe-editor-panel";

function FileList({ paths }: { paths: string[] }) {
  if (!paths.length) return null;
  return (
    <span className="font-mono">
      {paths.map((p) => p.split("/").pop()).join(", ")}
    </span>
  );
}

function EditorTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-1.5 font-medium ${
        active
          ? "border-[color:var(--ck-text-primary)] text-[color:var(--ck-text-primary)]"
          : "border-transparent text-[color:var(--ck-text-tertiary)] hover:text-[color:var(--ck-text-secondary)]"
      }`}
    >
      {children}
    </button>
  );
}

/** Diff tab: your installed recipe vs the shipped default (`recipes cat
 * --bundled`). Read-only — when a release changes a default you see exactly
 * what differs and fold it into your copy by hand on the Edit tab. */
function RecipeDefaultDiff({ defaultContent, current, busy }: { defaultContent: string | null; current: string; busy: boolean }) {
  if (busy) {
    return <p className="text-xs text-[color:var(--ck-text-tertiary)]">Loading…</p>;
  }
  if (defaultContent === null) {
    return (
      <p className="text-xs text-[color:var(--ck-text-tertiary)]">
        No shipped default to compare — this recipe has no bundled version (it&apos;s your own), or your installed jigga
        predates <code>recipes cat --bundled</code>.
      </p>
    );
  }
  return (
    <div>
      <p className="mb-2 text-xs text-[color:var(--ck-text-tertiary)]">
        <span className="text-red-300">− default (released)</span> vs{" "}
        <span className="text-emerald-300">+ your recipe</span>. Pull anything you want from the default into your copy on
        the <strong>Edit</strong> tab, then Save. <span className="italic">Formatting &amp; key order normalized;
        frontmatter comments not shown.</span>
      </p>
      <RecipeChangeDiff
        original={normalizeRecipe(defaultContent)}
        draft={normalizeRecipe(current)}
        emptyLabel="Your recipe matches the default (ignoring formatting)."
      />
    </div>
  );
}

function createLabel(recipe: Recipe | null): string {
  return recipe?.kind === "agent" ? "Create agent" : "Create team";
}

function EditorBody({
  recipe,
  draft,
  setDraft,
  original,
  dirty,
  parsed,
  busy,
  readOnly,
  defaultContent,
  tab,
  pendingFiles,
  modified,
}: {
  recipe: Recipe | null;
  draft: string;
  setDraft: (v: string) => void;
  original: string;
  dirty: boolean;
  parsed: { fm: ReturnType<typeof parseRecipeFrontmatter>["fm"]; error?: string };
  busy: boolean;
  readOnly: boolean;
  defaultContent: string | null;
  tab: "edit" | "diff";
  pendingFiles: string[];
  modified: string[];
}) {
  if (tab === "diff") {
    return (
      <div className="mt-3">
        <RecipeDefaultDiff defaultContent={defaultContent} current={draft} busy={busy} />
      </div>
    );
  }
  return (
    <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="flex flex-col">
        <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Recipe markdown</div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          disabled={busy || readOnly}
          readOnly={readOnly}
          placeholder={busy ? "Loading…" : ""}
          className="mt-2 h-[52vh] w-full resize-none rounded-lg border border-white/10 bg-white/5 p-3 font-mono text-xs text-[color:var(--ck-text-primary)] placeholder:text-[color:var(--ck-text-tertiary)]"
        />
        {readOnly ? (
          <p className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
            Read-only — this is the shipped template. <strong>{createLabel(recipe)}</strong> scaffolds it; your copy then
            becomes editable under Local recipes.
          </p>
        ) : (
          <div className="mt-3">
            <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Your unsaved edits</div>
            <div className="mt-2">
              {dirty ? (
                <RecipeChangeDiff original={original} draft={draft} />
              ) : (
                <EditorEmptyChanges pendingFiles={pendingFiles} modified={modified} />
              )}
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-col">
        <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Preview (from frontmatter)</div>
        <div className="mt-2 max-h-[78vh] overflow-auto pr-1">
          <RecipeInfoPanel fm={parsed.fm} error={parsed.error} />
        </div>
      </div>
    </div>
  );
}

function EditorFooter({
  recipe,
  readOnly,
  dirty,
  busy,
  onClose,
  onSave,
  onCreate,
}: {
  recipe: Recipe | null;
  readOnly: boolean;
  dirty: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: () => void;
  onCreate: () => void;
}) {
  let status = "No changes";
  if (readOnly) status = "Shipped template (read-only)";
  else if (dirty) status = "Unsaved changes";
  return (
    <div className="mt-4 flex items-center justify-between gap-2">
      <span className={`text-xs ${!readOnly && dirty ? "text-amber-300" : "text-[color:var(--ck-text-tertiary)]"}`}>
        {status}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
        >
          {readOnly ? "Close" : "Cancel"}
        </button>
        {readOnly ? (
          <button
            type="button"
            disabled={busy}
            onClick={onCreate}
            className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] hover:bg-[var(--ck-accent-red-hover)] disabled:opacity-50"
          >
            {busy ? "Creating…" : createLabel(recipe)}
          </button>
        ) : (
          <button
            type="button"
            disabled={!dirty || busy}
            onClick={onSave}
            className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] hover:bg-[var(--ck-accent-red-hover)] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        )}
      </div>
    </div>
  );
}

function RecipeEditorModal({
  recipe,
  draft,
  setDraft,
  original,
  dirty,
  parsed,
  busy,
  error,
  readOnly,
  defaultContent,
  tab,
  setTab,
  pendingFiles,
  modified,
  onClose,
  onSave,
  onCreate,
}: {
  recipe: Recipe | null;
  draft: string;
  setDraft: (v: string) => void;
  original: string;
  dirty: boolean;
  parsed: { fm: ReturnType<typeof parseRecipeFrontmatter>["fm"]; error?: string };
  busy: boolean;
  error: string | null;
  readOnly: boolean;
  defaultContent: string | null;
  tab: "edit" | "diff";
  setTab: (t: "edit" | "diff") => void;
  pendingFiles: string[];
  modified: string[];
  onClose: () => void;
  onSave: () => void;
  onCreate: () => void;
}) {
  const defaultDiffers = defaultContent !== null && defaultContent !== original;
  const verb = readOnly ? "View" : "Edit";
  const title = recipe ? `${verb} recipe: ${recipe.name}` : "Recipe";
  return (
    <Modal open={recipe !== null} onClose={onClose} title={title} size="full">
      <div className="text-xs text-[color:var(--ck-text-tertiary)]">
        {recipe ? <>{recipe.kind} · <span className="font-mono">{recipeStem(recipe.source)}</span> · <span className="font-mono">{recipe.source}</span></> : null}
      </div>
      {readOnly ? null : (
        <div className="mt-3 flex gap-1 border-b border-white/10 text-sm">
          <EditorTab active={tab === "edit"} onClick={() => setTab("edit")}>Edit</EditorTab>
          <EditorTab active={tab === "diff"} onClick={() => setTab("diff")}>
            Diff vs default{defaultDiffers ? " •" : ""}
          </EditorTab>
        </div>
      )}

      <EditorBody
        recipe={recipe}
        draft={draft}
        setDraft={setDraft}
        original={original}
        dirty={dirty}
        parsed={parsed}
        busy={busy}
        readOnly={readOnly}
        defaultContent={defaultContent}
        tab={readOnly ? "edit" : tab}
        pendingFiles={pendingFiles}
        modified={modified}
      />
      {error ? (
        <div className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>
      ) : null}
      <EditorFooter
        recipe={recipe}
        readOnly={readOnly}
        dirty={dirty}
        busy={busy}
        onClose={onClose}
        onSave={onSave}
        onCreate={onCreate}
      />
      {readOnly ? null : (
        <p className="mt-3 text-xs text-[color:var(--ck-text-tertiary)]">
          Save writes your copy to <code>~/.jigga/recipes</code> (overrides the bundled default). Then click{" "}
          <strong>Apply</strong> on the recipe&apos;s card to re-scaffold it (this recipe only).
        </p>
      )}
    </Modal>
  );
}

/** Shown in the editor's change panel when the markdown buffer is unedited.
 * Explains that this panel is about RECIPE edits, and disambiguates it from the
 * card's drift (which is about generated files / deployment, not the recipe). */
function EditorEmptyChanges({ pendingFiles, modified }: { pendingFiles: string[]; modified: string[] }) {
  return (
    <div className="space-y-2 text-xs text-[color:var(--ck-text-tertiary)]">
      <p>No unsaved edits — your changes to the recipe markdown will appear here as you type.</p>
      {pendingFiles.length ? (
        <p className="text-amber-400">
          Heads up: this recipe already differs from the running system (<FileList paths={pendingFiles} />). That&apos;s a
          deployment gap — close this and click <strong>Apply</strong> on the card to deploy it.
        </p>
      ) : null}
      {modified.length ? (
        <p className="text-amber-400">
          Heads up: a generated file was edited outside this recipe (<FileList paths={modified} />). Editing the recipe
          here won&apos;t change that file — <code>jigga update</code>’s picker does.
        </p>
      ) : null}
    </div>
  );
}

function recipeStem(source: string): string {
  const file = source.split("/").pop() ?? source;
  return file.replace(/\.md$/, "");
}

const BTN = "rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/15 disabled:opacity-50";

function DriftStatus({ record }: { record: InstalledRecord | undefined }) {
  const modified = record?.modified ?? [];
  const missing = record?.missing ?? [];
  if (modified.length + missing.length === 0) return null;
  return (
    <div className="mt-2 space-y-1 text-xs text-amber-400">
      {missing.length ? (
        <p>
          Missing: <FileList paths={missing} /> — <strong>Repair</strong> recreates {missing.length === 1 ? "it" : "them"}.
        </p>
      ) : null}
      {modified.length ? (
        <p>
          Locally edited (a generated file, not the recipe): <FileList paths={modified} /> — kept;{" "}
          <code>jigga update</code>’s picker overwrites only if you choose.
        </p>
      ) : null}
    </div>
  );
}

function RecipeCard({
  recipe,
  record,
  pendingFiles,
  busy,
  onEdit,
  onScaffold,
  onDelete,
}: {
  recipe: Recipe;
  record: InstalledRecord | undefined;
  pendingFiles: string[];
  busy: string | null;
  onEdit: (r: Recipe) => void;
  onScaffold: (r: Recipe) => void;
  onDelete: (r: Recipe) => void;
}) {
  const isPending = pendingFiles.length > 0;
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
          Recipe differs from the running system — <strong>Apply</strong> updates <FileList paths={pendingFiles} /> (this
          recipe only).
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
  onDelete,
}: {
  recipe: Recipe;
  isPending: boolean;
  hasMissing: boolean;
  busy: string | null;
  onEdit: (r: Recipe) => void;
  onScaffold: (r: Recipe) => void;
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
          onClick={() => onScaffold(recipe)}
          title="Apply just this recipe: re-scaffold it (updates its files to the recipe; never overwrites your edits). Does not touch other recipes."
        >
          {busy === recipe.id ? "Applying…" : "Apply"}
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

/** Builtin (shipped template) card — two actions, mirroring ClawRecipes:
 * Create team/agent (opens the id+name modal → a new independent instance) and
 * View recipe (read-only editor modal). The template itself is never edited or
 * "installed"; each Create makes a fresh Local copy you can multiply. */
function BuiltinCard({
  recipe,
  busy,
  onView,
  onCreate,
}: {
  recipe: Recipe;
  busy: string | null;
  onView: (r: Recipe) => void;
  onCreate: (r: Recipe) => void;
}) {
  const disabled = busy !== null;
  return (
    <li className="flex flex-col rounded-xl border border-[color:var(--ck-border-subtle)] bg-white/5 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium">{recipe.name}</div>
          <div className="text-xs text-[color:var(--ck-text-tertiary)]">
            {recipe.kind} · {recipe.id}
          </div>
        </div>
      </div>
      {recipe.description ? (
        <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">{recipe.description}</p>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-2 pt-3">
        <button
          className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-1.5 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] hover:bg-[var(--ck-accent-red-hover)] disabled:opacity-50"
          disabled={disabled}
          onClick={() => onCreate(recipe)}
          title="Create a new independent team/agent from this template (you can make as many as you like)"
        >
          {createLabel(recipe)}
        </button>
        <button className={BTN} disabled={disabled} onClick={() => onView(recipe)}>
          View recipe
        </button>
      </div>
    </li>
  );
}

function RecipeSection({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight text-[color:var(--ck-text-primary)]">{title}</h2>
      <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">{hint}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** First id of the form `<base>`, `<base>-2`, `<base>-3`… not already used by a
 * recipe — the free-instance suggestion (mirrors ClawRecipes' auto-increment). */
function freeInstanceId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

const ID_RE = /^[A-Za-z][A-Za-z0-9._-]*$/;

/** Asks for a new id (+ optional name) before creating an instance from a
 * builtin template. Lets you spin up as many independent copies as you want. */
function CreateInstanceModal({
  source,
  id,
  setId,
  name,
  setName,
  taken,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  source: Recipe | null;
  id: string;
  setId: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  taken: Set<string>;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const noun = source?.kind === "agent" ? "agent" : "team";
  const trimmed = id.trim();
  let invalid: string | null = null;
  if (!trimmed) invalid = `A ${noun} id is required.`;
  else if (!ID_RE.test(trimmed)) invalid = "Start with a letter; use letters, digits, '.', '_', '-'.";
  else if (taken.has(trimmed)) invalid = `${trimmed} is already taken — pick another.`;
  return (
    <Modal open={source !== null} onClose={onClose} title={source ? `Create ${noun} from ${source.name}` : "Create"}>
      <div className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-[color:var(--ck-text-primary)]">New {noun} id</span>
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            spellCheck={false}
            disabled={busy}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-[color:var(--ck-text-primary)]"
          />
          <span className="mt-1 block text-xs text-[color:var(--ck-text-tertiary)]">
            {noun === "team"
              ? "Members become <id>-<role> — independent of other copies."
              : "The agent is created under this id."}
          </span>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-[color:var(--ck-text-primary)]">Display name (optional)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
          />
        </label>
        {invalid ? <p className="text-xs text-amber-300">{invalid}</p> : null}
        {error ? (
          <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>
        ) : null}
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || invalid !== null}
          onClick={onConfirm}
          className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] hover:bg-[var(--ck-accent-red-hover)] disabled:opacity-50"
        >
          {busy ? "Creating…" : `Create ${noun}`}
        </button>
      </div>
    </Modal>
  );
}

export default function RecipesClient({
  recipes,
  installed,
  pendingPaths,
}: {
  recipes: Recipe[];
  installed: InstalledRecord[];
  pendingPaths: PendingPaths;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Recipe | null>(null);
  const [uninstallToo, setUninstallToo] = useState(false);

  // Editor state — one recipe open at a time.
  const [editing, setEditing] = useState<Recipe | null>(null);
  // "view" = read-only (builtin templates), "edit" = your local copy.
  const [editorReadOnly, setEditorReadOnly] = useState(false);
  const [draft, setDraft] = useState("");
  const [original, setOriginal] = useState("");
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  // The shipped default for this recipe (via `recipes cat --bundled`), for the
  // Diff tab. null = no default / older jigga without the flag.
  const [defaultContent, setDefaultContent] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<"edit" | "diff">("edit");

  // Create-instance modal state (Create team/agent from a builtin template).
  const [creating, setCreating] = useState<Recipe | null>(null);
  const [createId, setCreateId] = useState("");
  const [createName, setCreateName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const byRecipeId = new Map(installed.map((r) => [r.recipe_id, r]));
  // Every id in use (across templates + local copies) — for free-id suggestions
  // and duplicate validation in the Create modal.
  const takenIds = new Set(recipes.map((r) => r.id));
  const pendingSet = new Set(Object.keys(pendingPaths).filter((id) => (pendingPaths[id] ?? []).length > 0));
  const dirty = draft !== original;
  const parsed = useMemo(() => parseRecipeFrontmatter(draft), [draft]);
  const editingPending = editing ? pendingPaths[editing.id] ?? [] : [];
  const editingModified = editing ? byRecipeId.get(editing.id)?.modified ?? [] : [];

  async function openEditor(recipe: Recipe, readOnly = false) {
    setEditing(recipe);
    setEditorReadOnly(readOnly);
    setDraft("");
    setOriginal("");
    setDefaultContent(null);
    setEditorTab("edit");
    setEditorError(null);
    setEditorBusy(true);
    const stem = recipeStem(recipe.source);
    try {
      // Builtin (read-only) view: just the recipe markdown — it IS the default,
      // so there's no default to diff against. Local copies also fetch the
      // shipped default for the Diff tab (best-effort: missing on older jigga).
      const requests: Array<Promise<{ content?: string }>> = [
        fetchJson<{ content?: string }>(`/api/recipes/raw?name=${encodeURIComponent(stem)}`, { cache: "no-store" }),
      ];
      if (!readOnly) {
        requests.push(
          fetchJson<{ content?: string }>(`/api/recipes/raw?name=${encodeURIComponent(stem)}&bundled=1`, {
            cache: "no-store",
          }),
        );
      }
      const [rawRes, defRes] = await Promise.allSettled(requests);
      if (rawRes.status === "fulfilled") {
        const content = rawRes.value.content ?? "";
        setDraft(content);
        setOriginal(content);
      } else {
        setEditorError(rawRes.reason instanceof Error ? rawRes.reason.message : String(rawRes.reason));
      }
      setDefaultContent(defRes && defRes.status === "fulfilled" ? defRes.value.content ?? null : null);
    } finally {
      setEditorBusy(false);
    }
  }

  function closeEditor() {
    setEditing(null);
    setEditorReadOnly(false);
    setDraft("");
    setOriginal("");
    setDefaultContent(null);
    setEditorTab("edit");
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

  /** Open the Create-instance modal for a template, pre-filling a free id +
   * name. Closes the viewer if it was open (the View modal's Create button). */
  function openCreate(recipe: Recipe) {
    closeEditor();
    setCreating(recipe);
    setCreateId(freeInstanceId(recipeStem(recipe.source), takenIds));
    setCreateName("");
    setCreateError(null);
  }

  function closeCreate() {
    setCreating(null);
    setCreateId("");
    setCreateName("");
    setCreateError(null);
  }

  async function submitCreate() {
    if (!creating) return;
    setCreateBusy(true);
    setCreateError(null);
    try {
      await fetchJson("/api/recipes/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipe: recipeStem(creating.source),
          id: createId.trim(),
          name: createName.trim() || undefined,
        }),
      });
      setMessage(`Created ${createName.trim() || createId.trim()} from ${creating.name}. It's now a Local recipe.`);
      closeCreate();
      router.refresh();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreateBusy(false);
    }
  }

  const hasPending = pendingSet.size > 0;
  // `bundled === undefined` (older jigga without the flag) falls into Local —
  // the editable default keeps every recipe actionable.
  const localRecipes = recipes.filter((r) => !r.bundled);
  const builtinRecipes = recipes.filter((r) => r.bundled);

  return (
    <div className="mt-6">
      {hasPending ? (
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-amber-200">
            {pendingSet.size} recipe{pendingSet.size === 1 ? "" : "s"} with unapplied changes. Use a card&apos;s{" "}
            <strong>Apply</strong> for just that one, or apply <strong>all</strong> at once (also restarts the supervisor).
          </p>
          <button
            className="shrink-0 rounded-lg bg-amber-500/80 px-3 py-1.5 text-sm font-medium text-amber-950 hover:bg-amber-400 disabled:opacity-50"
            disabled={busy !== null}
            onClick={() => void applyUpdate()}
          >
            {busy === "__apply__" ? "Applying…" : "Apply all (jigga update)"}
          </button>
        </div>
      ) : null}
      {message ? <p className="mb-3 text-sm text-[color:var(--ck-text-secondary)]">{message}</p> : null}

      <div className="space-y-10">
        <RecipeSection
          title={`Local recipes (${localRecipes.length})`}
          hint="Your editable copies under ~/.jigga/recipes — Edit, Apply, and Delete."
        >
          {localRecipes.length ? (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {localRecipes.map((recipe) => (
                <RecipeCard
                  key={recipe.source}
                  recipe={recipe}
                  record={byRecipeId.get(recipe.id)}
                  pendingFiles={pendingPaths[recipe.id] ?? []}
                  busy={busy}
                  onEdit={(r) => void openEditor(r)}
                  onScaffold={(r) => void scaffold(r)}
                  onDelete={(r) => setDeleting(r)}
                />
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-[color:var(--ck-border-subtle)] bg-white/5 px-4 py-3 text-sm text-[color:var(--ck-text-secondary)]">
              None yet — create one from a builtin template below.
            </div>
          )}
        </RecipeSection>

        <RecipeSection
          title={`Builtin recipes (${builtinRecipes.length})`}
          hint="Shipped templates — Create a team/agent from one, or View the recipe."
        >
          {builtinRecipes.length ? (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {builtinRecipes.map((recipe) => (
                <BuiltinCard
                  key={recipe.source}
                  recipe={recipe}
                  busy={busy}
                  onView={(r) => void openEditor(r, true)}
                  onCreate={(r) => openCreate(r)}
                />
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-[color:var(--ck-border-subtle)] bg-white/5 px-4 py-3 text-sm text-[color:var(--ck-text-secondary)]">
              None.
            </div>
          )}
        </RecipeSection>
      </div>

      <RecipeEditorModal
        recipe={editing}
        draft={draft}
        setDraft={setDraft}
        original={original}
        dirty={dirty}
        parsed={parsed}
        busy={editorBusy}
        error={editorError}
        readOnly={editorReadOnly}
        defaultContent={defaultContent}
        tab={editorTab}
        setTab={setEditorTab}
        pendingFiles={editingPending}
        modified={editingModified}
        onClose={closeEditor}
        onSave={() => void saveEditor()}
        onCreate={() => { if (editing) openCreate(editing); }}
      />

      <CreateInstanceModal
        source={creating}
        id={createId}
        setId={setCreateId}
        name={createName}
        setName={setCreateName}
        taken={takenIds}
        busy={createBusy}
        error={createError}
        onClose={closeCreate}
        onConfirm={() => void submitCreate()}
      />

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
