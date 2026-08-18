"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { Deliverable } from "@/app/api/teams/deliverables/route";

/** What this team's workflows have produced.
 *
 * Every run writes its steps' outputs to files; until JIGGA #216 they were only
 * findable by knowing the directory layout, so a team's actual output — the
 * summary it wrote, the draft it produced — was the least visible thing about
 * it.
 */

const secondaryBtn =
  "rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10";

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function when(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export function DeliverablesTab({
  teamId,
  note,
}: {
  teamId: string;
  note: (message: string, isError?: boolean) => void;
}) {
  const [items, setItems] = useState<Deliverable[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Deliverable | null>(null);
  const [content, setContent] = useState("");
  const [viewError, setViewError] = useState<string | null>(null);

  const noteRef = useRef(note);
  noteRef.current = note;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const out = await fetchJson<{ deliverables: Deliverable[] }>(
        `/api/teams/deliverables?teamId=${encodeURIComponent(teamId)}`,
      );
      setItems(out.deliverables ?? []);
    } catch (e) {
      noteRef.current(e instanceof Error ? e.message : String(e), true);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function view(item: Deliverable) {
    if (open?.runId === item.runId && open?.name === item.name) {
      setOpen(null);
      return;
    }
    setOpen(item);
    setContent("");
    setViewError(null);
    try {
      const out = await fetchJson<{ content: string }>(
        `/api/teams/deliverables?teamId=${encodeURIComponent(teamId)}` +
          `&runId=${encodeURIComponent(item.runId)}&name=${encodeURIComponent(item.name)}`,
      );
      setContent(out.content ?? "");
    } catch (e) {
      setViewError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) {
    return <div className="mt-4 text-sm text-[color:var(--ck-text-tertiary)]">Loading deliverables…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="ck-card mt-4 p-4 text-sm text-[color:var(--ck-text-tertiary)]">
        Nothing produced yet. A deliverable is a file a workflow run wrote — each step&apos;s{" "}
        <span className="font-mono">output:</span> becomes one. Run one of this team&apos;s
        workflows and its output shows up here.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="ck-card p-0">
        {items.map((item) => {
          const active = open?.runId === item.runId && open?.name === item.name;
          return (
            <div
              key={`${item.runId}:${item.name}`}
              className="flex items-start justify-between gap-3 border-b border-[color:var(--ck-border-subtle)] px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{item.name}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-[color:var(--ck-text-tertiary)]">
                  <span className="font-mono">{item.workflowId}</span>
                  <span>· {size(item.bytes)}</span>
                  {item.modified ? <span>· {when(item.modified)}</span> : null}
                  {item.status && item.status !== "completed" ? (
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-200">
                      {item.status}
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 truncate font-mono text-[10px] text-[color:var(--ck-text-tertiary)]">
                  {item.runId}
                </div>
              </div>
              <button className={secondaryBtn + " shrink-0"} onClick={() => void view(item)}>
                {active ? "Close" : "View"}
              </button>
            </div>
          );
        })}
      </div>

      {open ? (
        <div className="ck-card p-4">
          <div className="text-sm font-medium">
            {open.name}
            <span className="ml-2 font-mono text-xs text-[color:var(--ck-text-tertiary)]">
              {open.runId}
            </span>
          </div>
          {viewError ? (
            <div className="mt-2 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
              {viewError}
            </div>
          ) : null}
          <pre className="mt-3 max-h-[50vh] overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs whitespace-pre-wrap text-[color:var(--ck-text-primary)]">
            {content || "(empty)"}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
