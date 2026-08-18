"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { WorkflowGraph } from "@/components/WorkflowGraph";
import type { GraphNode, RunGraph } from "@/app/api/workflows/runs/route";

/** Runs, drawn. Answers issue #13.
 *
 * A run that is waiting on a person is the case this screen exists for, so the
 * approval is answerable HERE — approve/deny then resume, rather than telling
 * you a code and leaving you to go and type it somewhere else.
 */

const POLL_MS = 5000;

const primaryBtn =
  "rounded-lg bg-[var(--ck-accent-red)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50";
const secondaryBtn =
  "rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50";

function statusPill(status: string): string {
  if (status === "running") return "bg-sky-500/20 text-sky-200";
  if (status === "awaiting_approval") return "bg-amber-500/20 text-amber-200";
  if (status === "failed" || status === "error") return "bg-red-500/20 text-red-200";
  if (status === "completed" || status === "done") return "bg-emerald-500/20 text-emerald-300";
  return "bg-white/10 text-[color:var(--ck-text-secondary)]";
}

function when(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function NodeDetail({
  node,
  runId,
  busy,
  onDecide,
}: {
  node: GraphNode;
  runId: string;
  busy: boolean;
  onDecide: (decision: "approve" | "deny") => void;
}) {
  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm">{node.id}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusPill(node.status)}`}>
          {node.status.replace(/_/g, " ")}
        </span>
        <span className="text-xs text-[color:var(--ck-text-tertiary)]">
          {[node.type, node.action, node.agent].filter(Boolean).join(" · ")}
        </span>
      </div>

      {node.status === "awaiting_approval" ? (
        <div className="mt-3">
          {/* Undelivered is not "unanswered": nobody was ever asked. Core
              distinguishes them, so the UI must not blur them back together. */}
          {node.delivery === "undelivered" ? (
            <p className="mb-2 rounded-lg border border-red-400/30 bg-red-500/10 p-2 text-xs text-red-100">
              This ask was never delivered{node.deliveryError ? `: ${node.deliveryError}` : ""}. Nobody
              has seen it — answering here is the only way it moves.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button className={primaryBtn} disabled={busy} onClick={() => onDecide("approve")}>
              {busy ? "Working…" : "Approve & resume"}
            </button>
            <button className={secondaryBtn} disabled={busy} onClick={() => onDecide("deny")}>
              Deny
            </button>
            {node.approvalCode ? (
              <span className="font-mono text-[10px] text-[color:var(--ck-text-tertiary)]">
                code {node.approvalCode} · or reply “approve {node.approvalCode}” on your channel
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="mt-2 font-mono text-[10px] text-[color:var(--ck-text-tertiary)]">{runId}</div>
    </div>
  );
}

export default function RunsClient({ workflowId }: { workflowId?: string }) {
  const [runs, setRuns] = useState<RunGraph[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    if (busyRef.current) return;   // don't fight an in-flight decision
    try {
      const query = workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : "";
      const out = await fetchJson<{ runs: RunGraph[]; error?: string }>(
        `/api/workflows/runs${query}`, { cache: "no-store" },
      );
      setRuns(out.runs ?? []);
      setError(out.error ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    void load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function decide(run: RunGraph, node: GraphNode, decision: "approve" | "deny") {
    if (!node.approvalCode) return;
    setBusy(`${run.runId}:${node.id}`);
    busyRef.current = true;
    try {
      const out = await fetchJson<{ warning?: string }>("/api/workflows/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: run.runId, code: node.approvalCode, decision }),
      });
      setError(out.warning ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busyRef.current = false;
      setBusy("");
      await load();
    }
  }

  if (loading) {
    return <p className="mt-4 text-sm text-[color:var(--ck-text-tertiary)]">Loading runs…</p>;
  }

  if (runs.length === 0) {
    return (
      <div className="ck-card mt-4 p-4 text-sm text-[color:var(--ck-text-tertiary)]">
        No runs yet. Start one with <span className="font-mono">jigga workflow run &lt;id&gt;</span>,
        or let a schedule, an event, or a webhook fire it.
        {error ? <span className="mt-2 block text-red-400">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {error ? (
        <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          {error}
        </div>
      ) : null}
      {runs.map((run) => {
        // Follow the interesting node unless someone picked one: what is
        // running, else what is waiting on a person, else nothing.
        const auto =
          run.nodes.find((n) => n.status === "running") ??
          run.nodes.find((n) => n.status === "awaiting_approval");
        const selectedId = selected[run.runId] ?? auto?.id ?? null;
        const node = run.nodes.find((n) => n.id === selectedId) ?? null;
        return (
          <div key={run.runId} className="ck-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{run.workflowId}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusPill(run.status)}`}>
                    {run.status.replace(/_/g, " ")}
                  </span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-[color:var(--ck-text-secondary)]">
                    {run.engine}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-[color:var(--ck-text-tertiary)]">
                  {when(run.startedAt)}
                  {run.completedAt ? ` → ${when(run.completedAt)}` : ""}
                  {run.artifacts.length
                    ? ` · ${run.artifacts.length} file${run.artifacts.length === 1 ? "" : "s"}`
                    : ""}
                </div>
              </div>
            </div>

            <div className="mt-3">
              <WorkflowGraph
                run={run}
                selected={selectedId}
                onSelect={(id) => setSelected((prev) => ({ ...prev, [run.runId]: id }))}
              />
            </div>

            {node ? (
              <NodeDetail
                node={node}
                runId={run.runId}
                busy={busy === `${run.runId}:${node.id}`}
                onDecide={(decision) => void decide(run, node, decision)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
