"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { fetchJson } from "@/lib/fetch-json";

/** Delete an agent or a team, behind a confirmation that says what will go.
 *
 * Deleting a team is the dangerous one: core also removes the agents and
 * workflows the team's install record OWNS, so a click that reads as "remove
 * this team" can take four agents with it. The modal fetches that list first
 * and names them. Typing the id to confirm is deliberate friction — this is the
 * one action in the app that destroys work, and it sits next to a button that
 * merely pauses it.
 *
 * Nothing is unrecoverable: core backs every file up under
 * `state/backups/<date>/` first, and the modal says so, because a warning that
 * overstates the danger gets clicked through just as fast as one that
 * understates it.
 */

type Preview = { removes: string[]; agents: string[]; workflows: string[] };

export function DeleteEntityButton({
  kind,
  id,
  className,
  redirectTo,
}: {
  kind: "agent" | "team";
  id: string;
  className?: string;
  /** Where to go once it is gone — the entity's own page no longer exists. */
  redirectTo: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const load = useCallback(async () => {
    try {
      const out = await fetchJson<Preview>(
        `/api/delete?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`,
        { cache: "no-store" },
      );
      setPreview(out);
    } catch (e) {
      // A failed preview must not block the delete, but it must not silently
      // become an empty list either — that would read as "nothing else goes".
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [kind, id]);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await fetchJson("/api/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, id }),
      });
      // Leave first: staying would re-render a page whose subject is gone.
      router.replace(redirectTo);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const alsoGoes = [
    ...(preview?.agents ?? []).map((name) => ({ kind: "agent", name })),
    ...(preview?.workflows ?? []).map((name) => ({ kind: "workflow", name })),
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTyped("");
          setError(null);
          setPreview(null);
          // Fetched on open rather than in an effect: it is a response to the
          // click, not to a render, and re-reading it each time means the list
          // reflects the record as it is now, not as it was when the page
          // loaded.
          void load();
        }}
        className={className ??
          "rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-medium " +
          "text-red-200 transition-colors hover:bg-red-500/20"}
      >
        Delete {kind}
      </button>

      <ConfirmationModal
        open={open}
        onClose={() => (busy ? undefined : setOpen(false))}
        title={`Delete ${kind} “${id}”?`}
        error={error}
        confirmLabel={`Delete ${kind}`}
        confirmBusyLabel="Deleting…"
        confirmDisabled={typed !== id}
        busy={busy}
        onConfirm={() => void confirm()}
      >
        <div className="space-y-3 text-sm">
          {alsoGoes.length > 0 ? (
            <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-3">
              <p className="font-medium text-red-100">
                This also deletes {alsoGoes.length} thing{alsoGoes.length === 1 ? "" : "s"} the
                team owns:
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {alsoGoes.map((entry) => (
                  <li key={`${entry.kind}:${entry.name}`} className="font-mono text-xs text-red-100">
                    {entry.kind} · {entry.name}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {preview ? (
            <details className="rounded-lg bg-white/5 p-2.5">
              <summary className="cursor-pointer text-xs text-[color:var(--ck-text-tertiary)]">
                {preview.removes.length} path{preview.removes.length === 1 ? "" : "s"} removed
              </summary>
              <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-[color:var(--ck-text-tertiary)]">
                {preview.removes.map((path) => <li key={path}>{path}</li>)}
              </ul>
            </details>
          ) : (
            <p className="text-xs text-[color:var(--ck-text-tertiary)]">Checking what this removes…</p>
          )}

          <p className="text-[color:var(--ck-text-secondary)]">
            Every file is backed up to <code>state/backups/</code> first, so this is recoverable
            from disk — but nothing in the app will put it back.
          </p>

          {kind === "agent" ? (
            <p className="text-xs text-[color:var(--ck-text-tertiary)]">
              Team rosters keep the member entry, because workflows and handoffs may still
              reference it. If you only want it to stop working, disable it instead.
            </p>
          ) : null}

          <label className="block text-xs text-[color:var(--ck-text-tertiary)]">
            Type <span className="font-mono text-[color:var(--ck-text-primary)]">{id}</span> to confirm
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5
                         text-sm text-[color:var(--ck-text-primary)]"
            />
          </label>
        </div>
      </ConfirmationModal>
    </>
  );
}
