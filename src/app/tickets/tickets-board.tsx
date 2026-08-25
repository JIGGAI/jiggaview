"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchJson } from "@/lib/fetch-json";
import TicketDialog from "./ticket-dialog";
import type { Lane, Ticket } from "./page";

const STATE_BADGE: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-300",
  claimed: "bg-sky-500/20 text-sky-300",
  running: "bg-sky-500/20 text-sky-300",
  completed: "bg-emerald-500/20 text-emerald-300",
  failed: "bg-red-500/20 text-red-300",
  needs_approval: "bg-purple-500/20 text-purple-300",
};

function TicketCard({
  ticket,
  lanes,
  busy,
  onMove,
  onEdit,
}: {
  ticket: Ticket;
  lanes: Lane[];
  busy: boolean;
  onMove: (ticket: Ticket, lane: string) => void;
  onEdit: (ticket: Ticket) => void;
}) {
  return (
    <li className="rounded-lg border border-[color:var(--ck-border-subtle)] bg-white/5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium">{ticket.title}</div>
        <button
          type="button"
          onClick={() => onEdit(ticket)}
          disabled={busy}
          className="shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 text-xs text-[color:var(--ck-text-tertiary)] hover:bg-white/10 disabled:opacity-50"
          aria-label={`Edit ${ticket.title}`}
        >
          Edit
        </button>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-[color:var(--ck-text-tertiary)]">
        <span className={`rounded-full px-2 py-0.5 ${STATE_BADGE[ticket.state] ?? "bg-white/10"}`}>{ticket.state}</span>
        <span>{ticket.assignee ?? "—"}</span>
      </div>
      {lanes.length ? (
        <select
          value={ticket.lane ?? ""}
          disabled={busy}
          onChange={(e) => onMove(ticket, e.target.value)}
          className="mt-2 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-[color:var(--ck-text-primary)] disabled:opacity-50"
          aria-label="Move ticket to lane"
        >
          {ticket.lane && !lanes.some((l) => l.id === ticket.lane) ? (
            <option value={ticket.lane}>{ticket.lane} (current)</option>
          ) : null}
          {lanes.map((l) => (
            <option key={l.id} value={l.id}>
              Move to: {l.id}
            </option>
          ))}
        </select>
      ) : null}
    </li>
  );
}

function Column({
  lane,
  tickets,
  lanes,
  busy,
  onMove,
  onEdit,
}: {
  lane: Lane | { id: string; description?: string | null; gate?: null };
  tickets: Ticket[];
  lanes: Lane[];
  busy: boolean;
  onMove: (ticket: Ticket, lane: string) => void;
  onEdit: (ticket: Ticket) => void;
}) {
  return (
    <div className="flex min-w-[240px] max-w-[300px] flex-1 flex-col rounded-xl border border-[color:var(--ck-border-subtle)] bg-black/20">
      <div className="border-b border-[color:var(--ck-border-subtle)] p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{lane.id}</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-[color:var(--ck-text-tertiary)]">
            {tickets.length}
          </span>
        </div>
        {lane.description ? (
          <p className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">{lane.description}</p>
        ) : null}
        {lane.gate ? (
          <p className="mt-1 text-xs text-amber-300">gate: {lane.gate}</p>
        ) : null}
      </div>
      <ul className="flex flex-col gap-2 p-2">
        {tickets.map((t) => (
          <TicketCard key={t.id} ticket={t} lanes={lanes} busy={busy} onMove={onMove} onEdit={onEdit} />
        ))}
        {tickets.length === 0 ? (
          <li className="px-2 py-4 text-center text-xs text-[color:var(--ck-text-tertiary)]">—</li>
        ) : null}
      </ul>
    </div>
  );
}

export default function TicketsBoard({
  teams,
  teamId,
  lanes,
  tickets,
  members,
}: {
  teams: Array<{ id: string; name: string }>;
  teamId: string;
  lanes: Lane[];
  tickets: Ticket[];
  members: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actAs, setActAs] = useState("");
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; ticket?: Ticket } | null>(null);

  function switchTeam(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set("team", id);
    router.push(`/tickets?${next.toString()}`);
  }

  async function move(ticket: Ticket, lane: string) {
    if (lane === ticket.lane) return;
    setBusy(true);
    setMessage(null);
    try {
      await fetchJson("/api/tickets/move", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: ticket.id, lane, as: actAs.trim() || undefined }),
      });
      setMessage(`Moved “${ticket.title}” → ${lane}.`);
      router.refresh();
    } catch (e) {
      // Gate errors point at the member who can move it — fill that into "act as".
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function saved(text: string) {
    setMessage(text);
    router.refresh();
  }

  // Group tickets by lane; collect any whose lane is unset/stale under UNFILED.
  const byLane = new Map<string, Ticket[]>();
  for (const lane of lanes) byLane.set(lane.id, []);
  const unfiled: Ticket[] = [];
  for (const t of tickets) {
    const bucket = t.lane && byLane.has(t.lane) ? byLane.get(t.lane)! : unfiled;
    bucket.push(t);
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        {teams.length ? (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[color:var(--ck-text-tertiary)]">Team</span>
            <select
              value={teamId}
              onChange={(e) => switchTeam(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.id})
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex items-center gap-2 text-sm" title="Identity to move tickets as — required to move OUT of a gated lane.">
          <span className="text-[color:var(--ck-text-tertiary)]">Act as</span>
          <input
            value={actAs}
            onChange={(e) => setActAs(e.target.value)}
            placeholder="member / role (for gated lanes)"
            className="w-56 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm"
          />
        </label>
        {teamId ? (
          <button
            type="button"
            onClick={() => setDialog({ mode: "create" })}
            disabled={busy || !lanes.length}
            title={lanes.length ? undefined : "This team has no ticket board yet."}
            className="ml-auto rounded-lg bg-white/15 px-3 py-1.5 text-sm font-medium hover:bg-white/25 disabled:opacity-50"
          >
            New ticket
          </button>
        ) : null}
      </div>

      {message ? <p className="mt-3 text-sm text-[color:var(--ck-text-secondary)]">{message}</p> : null}

      {renderBody()}

      {dialog ? (
        <TicketDialog
          mode={dialog.mode}
          ticket={dialog.ticket}
          teamId={teamId}
          lanes={lanes}
          members={members}
          actAs={actAs}
          onClose={() => setDialog(null)}
          onSaved={saved}
        />
      ) : null}
    </div>
  );

  function renderBody() {
    if (!teamId) {
      return <p className="mt-6 text-sm text-[color:var(--ck-text-tertiary)]">No teams yet.</p>;
    }
    if (!lanes.length) {
      return (
        <p className="mt-6 text-sm text-[color:var(--ck-text-tertiary)]">
          Team <span className="font-mono">{teamId}</span> has no ticket lanes. Add a <code>lanes:</code> block to its
          recipe (or set <code>lanes: true</code>) and re-scaffold.
        </p>
      );
    }
    return (
      <div className="mt-6 flex gap-3 overflow-x-auto pb-2">
        {lanes.map((lane) => (
          <Column
            key={lane.id}
            lane={lane}
            tickets={byLane.get(lane.id) ?? []}
            lanes={lanes}
            busy={busy}
            onMove={move}
            onEdit={(t) => setDialog({ mode: "edit", ticket: t })}
          />
        ))}
        {unfiled.length ? (
          <Column
            lane={{ id: "unfiled", description: "Tickets with no lane set." }}
            tickets={unfiled}
            lanes={lanes}
            busy={busy}
            onMove={move}
            onEdit={(t) => setDialog({ mode: "edit", ticket: t })}
          />
        ) : null}
      </div>
    );
  }
}
