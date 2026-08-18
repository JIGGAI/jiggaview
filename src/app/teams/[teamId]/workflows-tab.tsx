"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { WorkflowEditor } from "@/components/WorkflowEditor";
import type { TeamWorkflow } from "@/app/api/teams/workflows/route";

/** The playbooks this team runs.
 *
 * Workflows are global files with no team field, so each card says WHY it is
 * here — declared by the team, written by its recipe install, or naming its
 * agents. Editing writes through `workflow save`, which validates in core and
 * refuses rather than letting a broken workflow reach the supervisor.
 */

const VIA_LABEL: Record<TeamWorkflow["via"], string> = {
  declared: "in default_workflows",
  installed: "installed by this team's recipe",
  agents: "runs this team's agents",
};

const secondaryBtn =
  "rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50";

function WorkflowCard({
  workflow,
  open,
  onToggle,
}: {
  workflow: TeamWorkflow;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={open}
      className={
        "flex w-full items-start justify-between gap-3 border-b border-[color:var(--ck-border-subtle)] px-4 py-3 text-left last:border-b-0 " +
        (open ? "bg-white/10" : "hover:bg-white/5")
      }
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{workflow.name}</span>
          {workflow.status ? (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-[color:var(--ck-text-secondary)]">
              {workflow.status}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-[color:var(--ck-text-tertiary)]">
          {workflow.id}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-[color:var(--ck-text-tertiary)]">
          <span>{VIA_LABEL[workflow.via]}</span>
          {workflow.stepCount ? <span>· {workflow.stepCount} steps</span> : null}
          {workflow.trigger ? <span>· {workflow.trigger}</span> : null}
          {workflow.agents.length ? <span>· {workflow.agents.join(", ")}</span> : null}
        </div>
      </div>
      <span className={secondaryBtn + " shrink-0"}>{open ? "Close" : "View / edit"}</span>
    </button>
  );
}

export function WorkflowsTab({
  teamId,
  note,
}: {
  teamId: string;
  note: (msg: string, isError?: boolean) => void;
}) {
  const [workflows, setWorkflows] = useState<TeamWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string>("");

  // The parent's `note` is a fresh closure each render; depending on it would
  // re-fire the load effect every render.
  const noteRef = useRef(note);
  noteRef.current = note;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const out = await fetchJson<{ workflows: TeamWorkflow[] }>(
        `/api/teams/workflows?teamId=${encodeURIComponent(teamId)}`,
      );
      setWorkflows(out.workflows ?? []);
    } catch (e) {
      noteRef.current(e instanceof Error ? e.message : String(e), true);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Show a diagram straight away rather than an inert list: the shape of the
  // first workflow is the most useful thing this tab can say on arrival.
  useEffect(() => {
    setOpenId((current) => current || workflows[0]?.id || "");
  }, [workflows]);

  if (loading) {
    return <div className="mt-4 text-sm text-[color:var(--ck-text-tertiary)]">Loading workflows…</div>;
  }

  return (
    <div className="mt-4 space-y-4">
      {workflows.length === 0 ? (
        <div className="ck-card p-4 text-sm text-[color:var(--ck-text-tertiary)]">
          No workflows belong to this team yet. A workflow joins by being listed in the team&apos;s{" "}
          <span className="font-mono">default_workflows</span>, by being installed from its recipe,
          or by naming one of its agents in a step.
        </div>
      ) : (
        <div className="ck-card p-0">
          {workflows.map((w) => (
            <WorkflowCard key={w.id} workflow={w} open={openId === w.id} onToggle={() => setOpenId((current) => (current === w.id ? "" : w.id))} />
          ))}
        </div>
      )}

      {openId ? (
        <div className="ck-card p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium">{openId}</h2>
            <Link
              href={`/workflows/${encodeURIComponent(openId)}`}
              className="text-xs text-[color:var(--ck-text-tertiary)] hover:underline"
            >
              Open full page →
            </Link>
          </div>
          {/* The same editor as /workflows/<id>: one artifact, one way to see
              and change it, wherever you happen to be standing. */}
          <WorkflowEditor workflowId={openId} onSaved={() => void load()} />
        </div>
      ) : null}
    </div>
  );
}
