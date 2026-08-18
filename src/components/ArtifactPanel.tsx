"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";

/** The file a workflow node wrote, beside the node that wrote it.
 *
 * A step's `output:` is a real file, and until now the only way to read one was
 * the Deliverables tab — a separate page, listing files by name, with nothing
 * connecting `copy.md` back to the node called `copy`. Selecting a node on the
 * diagram and seeing what it produced is the same question asked in the place
 * you were already looking.
 *
 * Editing is offered only where core allows it. A `running` run refuses the
 * write (a node may be mid-write), so the button says why rather than failing
 * on click — but the important case is the parked one: a run sitting on
 * `human_approval` is exactly where fixing two wrong sentences and approving
 * beats denying and re-running the whole graph.
 */

type Loaded = { content: string | null; exists: boolean; note?: string };

const secondaryBtn =
  "rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium " +
  "text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50";

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[color:var(--ck-text-tertiary)]">{children}</p>;
}

/** The file itself, once we know there is one — split out so the panel above
 * stays a shell around open/closed and load state. */
function ArtifactBody({
  name, draft, dirty, busy, editable, lockedReason, saved, onChange, onSave, onRevert,
}: {
  name: string;
  draft: string;
  dirty: boolean;
  busy: boolean;
  editable: boolean;
  lockedReason?: string;
  saved: string | null;
  onChange: (value: string) => void;
  onSave: () => void;
  onRevert: () => void;
}) {
  return (
    <>
      <textarea
        className="h-56 w-full rounded-lg border border-white/10 bg-white/5 p-2 font-mono text-xs
                   text-[color:var(--ck-text-primary)] disabled:opacity-70"
        value={draft}
        readOnly={!editable}
        disabled={busy}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${name} contents`}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {editable ? (
          <>
            <button className={secondaryBtn} disabled={busy || !dirty} onClick={onSave}>
              {busy ? "Saving…" : "Save file"}
            </button>
            <button
              className={secondaryBtn}
              disabled={busy || !dirty}
              onClick={onRevert}
            >
              Revert
            </button>
          </>
        ) : (
          <span className="text-[11px] text-[color:var(--ck-text-tertiary)]">
            {lockedReason ?? "Read-only."}
          </span>
        )}
        {saved ? <span className="text-[11px] text-emerald-300">{saved}</span> : null}
      </div>
    </>
  );
}

export function ArtifactPanel({
  runId,
  name,
  role,
  editable,
  lockedReason,
}: {
  runId: string;
  name: string;
  /** Whether this node writes the file or reads it — the same file is both. */
  role: "output" | "input";
  editable: boolean;
  /** Why editing is off, shown instead of a Save button that would fail. */
  lockedReason?: string;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const out = await fetchJson<Loaded>(
        `/api/workflows/artifact?runId=${encodeURIComponent(runId)}&name=${encodeURIComponent(name)}`,
        { cache: "no-store" },
      );
      setLoaded(out);
      setDraft(out.content ?? "");
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [runId, name]);

  useEffect(() => {
    if (open && loaded === null) void load();
  }, [open, loaded, load]);

  // A different node (or a different run) reuses this component; its content
  // must not linger from the last one.
  useEffect(() => {
    setLoaded(null);
    setDirty(false);
    setSaved(null);
  }, [runId, name]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await fetchJson(`/api/workflows/artifact`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, name, content: draft }),
      });
      setSaved("Saved");
      setDirty(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-black/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/5"
      >
        <span className="flex items-center gap-2 text-xs">
          <span className="text-[color:var(--ck-text-tertiary)]">
            {role === "output" ? "writes" : "reads"}
          </span>
          <span className="font-mono text-[color:var(--ck-text-primary)]">{name}</span>
        </span>
        <span className="text-[10px] text-[color:var(--ck-text-tertiary)]">
          {open ? "hide" : "view"}
        </span>
      </button>

      {open ? (
        <div className="border-t border-white/10 p-3">
          {error ? <p className="mb-2 text-xs text-red-300">{error}</p> : null}
          {loaded === null ? <Muted>Loading…</Muted> : null}
          {/* Not an error: a node that has not run yet has nothing to show. */}
          {loaded && !loaded.exists ? (
            <Muted>Not written yet — this node has not produced {name} in this run.</Muted>
          ) : null}
          {loaded?.exists ? (
            <ArtifactBody
              name={name}
              draft={draft}
              dirty={dirty}
              busy={busy}
              editable={editable}
              lockedReason={lockedReason}
              saved={saved}
              onChange={(v) => { setDraft(v); setDirty(true); setSaved(null); }}
              onSave={() => void save()}
              onRevert={() => { setDraft(loaded.content ?? ""); setDirty(false); }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
