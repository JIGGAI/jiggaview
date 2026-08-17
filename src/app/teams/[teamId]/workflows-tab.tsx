"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
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

const primaryBtn =
  "rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50";
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
    <div className="flex items-start justify-between gap-3 border-b border-[color:var(--ck-border-subtle)] px-4 py-3 last:border-b-0">
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
      <button className={secondaryBtn + " shrink-0"} onClick={onToggle}>
        {open ? "Close" : "View / edit"}
      </button>
    </div>
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
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  // The parent's `note` is a new closure each render; depending on it would
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

  async function open(id: string) {
    setEditorError(null);
    if (openId === id) {
      setOpenId("");
      return;
    }
    setOpenId(id);
    setContent("");
    try {
      const out = await fetchJson<{ content: string }>(
        `/api/teams/workflows?teamId=${encodeURIComponent(teamId)}&id=${encodeURIComponent(id)}`,
      );
      setContent(out.content ?? "");
    } catch (e) {
      setEditorError(e instanceof Error ? e.message : String(e));
    }
  }

  async function save() {
    setSaving(true);
    setEditorError(null);
    try {
      await fetchJson("/api/teams/workflows", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: openId, content }),
      });
      noteRef.current(`Saved ${openId}. The supervisor picks it up on its next tick.`);
      await load();
    } catch (e) {
      // Core refuses a workflow that would not run and says exactly why —
      // show that instead of a generic failure.
      setEditorError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

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
            <WorkflowCard key={w.id} workflow={w} open={openId === w.id} onToggle={() => void open(w.id)} />
          ))}
        </div>
      )}

      {openId ? (
        <div className="ck-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">
              {openId}.yaml
            </h2>
            <button className={primaryBtn} disabled={saving || !content.trim()} onClick={() => void save()}>
              {saving ? "Saving…" : "Save workflow"}
            </button>
          </div>
          {editorError ? (
            <div className="mt-2 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
              {editorError}
            </div>
          ) : null}
          <p className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
            Validated on save — a workflow that would not run (unparseable yaml, an id that
            disagrees with the file, a cycle in a DAG) is refused rather than written.
          </p>
          <textarea
            className="mt-3 h-[50vh] w-full resize-none rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs text-[color:var(--ck-text-primary)]"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>
      ) : null}
    </div>
  );
}
