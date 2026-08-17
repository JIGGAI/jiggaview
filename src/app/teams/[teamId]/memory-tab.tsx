"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { MemoryEntry } from "@/app/api/teams/memory/route";

/** What a team durably knows: `shared-context/memory/team.jsonl`, plus the
 * curated `pinned.jsonl` subset that an agent's context pack actually reads.
 *
 * Agents write here mid-run through `memory.remember`. This is the same store
 * from the human side — read it, add to it, and escalate the entries worth
 * putting in front of every agent that wakes up.
 */

// Core stores `type` as free text; these are the ones agents actually emit.
const TYPES = ["fact", "decision", "preference", "learning", "runbook", "risk"] as const;

const inputCls =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]";
const primaryBtn =
  "rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50";
const secondaryBtn =
  "rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50";

function when(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? String(iso).slice(0, 19) : date.toLocaleString();
}

function EntryCard({
  entry,
  pinned,
  busy,
  onPin,
}: {
  entry: MemoryEntry;
  pinned: boolean;
  busy: boolean;
  onPin: (id: string) => void;
}) {
  // Who wrote it: an agent's entry records {agent: id}, a human's {actor: user}.
  const source = entry.source as { agent?: string; actor?: string } | undefined;
  const author = source?.agent ?? (source?.actor === "user" ? "you" : null);
  return (
    <li className="ck-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-[color:var(--ck-text-primary)]">{entry.text}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[color:var(--ck-text-tertiary)]">
            <span className="rounded-full bg-white/10 px-2 py-0.5">{entry.type || "fact"}</span>
            <span>{when(entry.time)}</span>
            {author ? <span>· {author}</span> : null}
            {(entry.tags ?? []).map((tag) => (
              <span key={tag} className="rounded-full border border-white/10 px-2 py-0.5">
                #{tag}
              </span>
            ))}
            <span className="font-mono opacity-60">{entry.id}</span>
          </div>
        </div>
        {pinned ? (
          <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">
            pinned
          </span>
        ) : (
          <button
            className={secondaryBtn + " shrink-0"}
            disabled={busy}
            onClick={() => onPin(entry.id)}
            title="Escalate into the pinned subset agents read on wake"
          >
            Pin
          </button>
        )}
      </div>
    </li>
  );
}

function EntryList({
  entries,
  loading,
  busy,
  onlyPinned,
  pinnedIds,
  onPin,
}: {
  entries: MemoryEntry[];
  loading: boolean;
  busy: boolean;
  onlyPinned: boolean;
  pinnedIds: Set<string>;
  onPin: (id: string) => void;
}) {
  if (loading) {
    return <div className="text-sm text-[color:var(--ck-text-tertiary)]">Loading…</div>;
  }
  if (entries.length === 0) {
    return (
      <div className="ck-card p-4 text-sm text-[color:var(--ck-text-tertiary)]">
        {onlyPinned
          ? "Nothing pinned yet. Pin the entries every agent should wake up knowing."
          : "This team hasn't remembered anything yet — add the first fact above, or let an agent write one."}
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {entries.map((entry) => (
        <EntryCard
          key={entry.id}
          entry={entry}
          pinned={pinnedIds.has(entry.id)}
          busy={busy}
          onPin={onPin}
        />
      ))}
    </ul>
  );
}

export function MemoryTab({ teamId, note }: { teamId: string; note: (msg: string, isError?: boolean) => void }) {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [text, setText] = useState("");
  const [type, setType] = useState<string>("fact");
  const [tags, setTags] = useState("");

  // `note` comes from the parent and is a fresh closure every render. Depending
  // on it directly would make `load` a new function each render, re-fire the
  // effect below, setState, and loop forever. A ref keeps the latest one
  // without making it a dependency.
  const noteRef = useRef(note);
  noteRef.current = note;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [all, pinned] = await Promise.all([
        fetchJson<{ entries: MemoryEntry[] }>(`/api/teams/memory?teamId=${encodeURIComponent(teamId)}`),
        fetchJson<{ entries: MemoryEntry[] }>(`/api/teams/memory?teamId=${encodeURIComponent(teamId)}&pinned=1`),
      ]);
      // Newest first — the opposite of the append-only file, which reads oldest first.
      setEntries([...all.entries].reverse());
      setPinnedIds(new Set(pinned.entries.map((e) => e.id)));
    } catch (e) {
      noteRef.current(e instanceof Error ? e.message : String(e), true);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    setBusy(true);
    try {
      await fetchJson("/api/teams/memory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          teamId,
          text,
          type,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      setText("");
      setTags("");
      noteRef.current("Remembered. Agents on this team can retrieve it via memory.search.");
      await load();
    } catch (e) {
      noteRef.current(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }

  async function pin(entryId: string) {
    setBusy(true);
    try {
      const res = await fetchJson<{ already_pinned?: boolean }>("/api/teams/memory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId, entryId }),
      });
      noteRef.current(res.already_pinned ? "Already pinned." : "Pinned — every agent sees it on wake.");
      await load();
    } catch (e) {
      noteRef.current(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }

  const shown = onlyPinned ? entries.filter((e) => pinnedIds.has(e.id)) : entries;

  return (
    <div className="mt-4 space-y-4">
      <div className="ck-card max-w-3xl p-4">
        <h2 className="text-sm font-medium">Remember something</h2>
        <p className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
          Written to this team&apos;s <span className="font-mono">shared-context/memory/team.jsonl</span> — the
          same store agents write with <span className="font-mono">memory.remember</span>, and searchable
          immediately.
        </p>
        <div className="mt-3 space-y-2">
          <textarea
            className={inputCls + " h-20 resize-none"}
            placeholder="e.g. The client signs off on copy before anything is scheduled."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              className={inputCls}
              placeholder="tags, comma separated (optional)"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
            <button className={primaryBtn} disabled={busy || !text.trim()} onClick={() => void add()}>
              Remember
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">
          {shown.length} {onlyPinned ? "pinned" : "entries"}
          {!onlyPinned && pinnedIds.size ? (
            <span className="text-[color:var(--ck-text-tertiary)]"> · {pinnedIds.size} pinned</span>
          ) : null}
        </h2>
        <label className="flex items-center gap-2 text-xs text-[color:var(--ck-text-secondary)]">
          <input type="checkbox" checked={onlyPinned} onChange={(e) => setOnlyPinned(e.target.checked)} />
          Pinned only
        </label>
      </div>

      <EntryList
        entries={shown}
        loading={loading}
        busy={busy}
        onlyPinned={onlyPinned}
        pinnedIds={pinnedIds}
        onPin={(id) => void pin(id)}
      />
    </div>
  );
}
