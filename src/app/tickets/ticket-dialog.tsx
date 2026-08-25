"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { Lane, Ticket } from "./page";

/** The shape a hand-filed ticket is expected to arrive in.
 *
 * The team recipes tell agents every ticket carries context, the project it
 * lands in, requirements and an acceptance check someone else can run — but
 * core stores a flat `description`, so nothing enforces it. Seeding the box
 * with the headings is the cheap version of that convention: it costs a person
 * nothing to delete, and it stops a one-line ticket being the path of least
 * resistance.
 */
export const TICKET_TEMPLATE = `## Context

## Project

## Requirements

## Acceptance check
_A command someone else can run_
`;

/** The confirm step for taking a ticket off the board.
 *
 * Its own component so the difference between the two verbs is stated once, in
 * the place a person reads it — and so the dialog does not carry two more
 * branches of layout.
 */
function ConfirmRetire({
  action, title, busy, onCancel, onConfirm,
}: {
  action: "archive" | "delete";
  title: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const destructive = action === "delete";
  let confirmLabel = destructive ? "Delete it" : "Archive it";
  if (busy) confirmLabel = "Working…";
  return (
    <div className="mt-5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
      <p className="text-sm">
        {destructive ? (
          <>
            Delete <span className="font-medium">{title}</span> permanently? Nothing is kept and
            this cannot be undone.
          </>
        ) : (
          <>
            Archive <span className="font-medium">{title}</span>? It leaves the board and the file
            is kept, so it can be restored.
          </>
        )}
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Keep it
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
            destructive ? "bg-red-500/80 hover:bg-red-500" : "bg-white/15 hover:bg-white/25"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

type Props = {
  mode: "create" | "edit";
  teamId: string;
  lanes: Lane[];
  members: string[];
  actAs: string;
  ticket?: Ticket;
  onClose: () => void;
  onSaved: (message: string) => void;
};

export default function TicketDialog({
  mode, teamId, lanes, members, actAs, ticket, onClose, onSaved,
}: Props) {
  const editing = mode === "edit";
  const [title, setTitle] = useState(ticket?.title ?? "");
  const [description, setDescription] = useState(
    editing ? String(ticket?.description ?? "") : TICKET_TEMPLATE,
  );
  const [assignee, setAssignee] = useState(ticket?.assignee ?? "");
  const [lane, setLane] = useState(ticket?.lane ?? lanes[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Archiving and deleting are different decisions, so the footer asks which
  // one you meant before doing either. Inline rather than window.confirm: it
  // can say what the difference actually is.
  const [confirming, setConfirming] = useState<"archive" | "delete" | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  /** The edit body carries only what actually changed: core reads an omitted
   * field as "leave alone", so sending all three every time would overwrite a
   * description someone edited from another tab. Returns null when nothing
   * changed, so the caller can skip the request entirely. */
  function editBody(current: Ticket): Record<string, string> | null {
    const body: Record<string, string> = { task: current.id };
    if (title !== current.title) body.title = title;
    if (description !== String(current.description ?? "")) body.description = description;
    if (assignee !== (current.assignee ?? "")) body.assignee = assignee;
    if (Object.keys(body).length === 1) return null;
    if (actAs.trim()) body.as = actAs.trim();
    return body;
  }

  function post(path: string, body: unknown) {
    return fetchJson(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function submit() {
    if (editing && ticket) {
      const body = editBody(ticket);
      if (!body) {
        onSaved("Nothing changed.");
        return;
      }
      await post("/api/tickets/update", body);
      onSaved(`Updated “${title.trim()}”.`);
      return;
    }
    await post("/api/tickets/create", {
      team: teamId,
      title,
      description,
      assignee,
      lane,
      as: actAs.trim() || undefined,
    });
    onSaved(`Filed “${title.trim()}”.`);
  }

  async function save() {
    if (!title.trim()) {
      setError("A title is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submit();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function retire(action: "archive" | "delete") {
    if (!ticket) return;
    setBusy(true);
    setError(null);
    try {
      await post("/api/tickets/retire", {
        task: ticket.id,
        action,
        as: actAs.trim() || undefined,
      });
      onSaved(
        action === "archive"
          ? `Archived “${ticket.title}” — the file is kept.`
          : `Deleted “${ticket.title}”.`,
      );
      onClose();
    } catch (e) {
      // A gated lane refuses this the same way it refuses a move; the message
      // names the member who can do it, to be typed into "Act as".
      setError(e instanceof Error ? e.message : String(e));
      setConfirming(null);
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]";
  const label = "block text-xs text-[color:var(--ck-text-tertiary)]";
  let submitLabel = editing ? "Save changes" : "File ticket";
  if (busy) submitLabel = "Saving…";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editing ? "Edit ticket" : "New ticket"}
        className="w-full max-w-xl rounded-xl border border-[color:var(--ck-border-subtle)] bg-[color:var(--ck-bg-elevated,#14161a)] p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold">{editing ? "Edit ticket" : "New ticket"}</h2>
        <p className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
          {editing ? (
            <>
              <span className="font-mono">{ticket?.id}</span> — lane and state are changed from the
              board, not here.
            </>
          ) : (
            <>Filed onto <span className="font-mono">{teamId}</span>.</>
          )}
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <label className={label}>
            Title
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing"
              className={`mt-1 ${field}`}
            />
          </label>

          <label className={label}>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={12}
              className={`mt-1 font-mono text-xs ${field}`}
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <label className={`${label} flex-1`}>
              Assignee
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className={`mt-1 ${field}`}
              >
                <option value="">— unassigned —</option>
                {/* An assignee set elsewhere (or a since-removed member) must
                    still render, or saving would silently reassign the ticket. */}
                {assignee && !members.includes(assignee) ? (
                  <option value={assignee}>{assignee}</option>
                ) : null}
                {members.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>

            {!editing && lanes.length ? (
              <label className={`${label} flex-1`}>
                Starting lane
                <select
                  value={lane}
                  onChange={(e) => setLane(e.target.value)}
                  className={`mt-1 ${field}`}
                >
                  {lanes.map((l) => (
                    <option key={l.id} value={l.id}>{l.id}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>

        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}

        {confirming ? (
          <ConfirmRetire
            action={confirming}
            title={ticket?.title ?? ""}
            busy={busy}
            onCancel={() => setConfirming(null)}
            onConfirm={() => retire(confirming)}
          />
        ) : null}

        <div className="mt-5 flex items-center gap-2">
          {editing && !confirming ? (
            <>
              <button
                type="button"
                onClick={() => setConfirming("archive")}
                disabled={busy}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-[color:var(--ck-text-secondary)] hover:bg-white/10 disabled:opacity-50"
              >
                Archive
              </button>
              <button
                type="button"
                onClick={() => setConfirming("delete")}
                disabled={busy}
                className="rounded-lg border border-red-500/40 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50"
              >
                Delete
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="ml-auto rounded-lg border border-white/10 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || confirming !== null}
            className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-medium hover:bg-white/25 disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
