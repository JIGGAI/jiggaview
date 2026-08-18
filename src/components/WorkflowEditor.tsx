"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { ArtifactPanel } from "@/components/ArtifactPanel";
import { WorkflowGraph } from "@/components/WorkflowGraph";
import { fetchJson } from "@/lib/fetch-json";
import type { GraphEdge, RunGraph } from "@/app/api/workflows/runs/route";

/** A workflow's shape, as the thing you edit.
 *
 * The graph is the primary view of a workflow because the shape IS the
 * workflow — which node feeds which, and what happens when one fails. The yaml
 * is still the source of truth: this reads it, edits the parsed document, and
 * writes it back through `workflow save`, so a workflow written by hand and one
 * built here are the same artifact.
 *
 * Positions are NOT stored. ClawKitchen persists x/y in its workflow file;
 * JIGGA's workflows are hand-edited yaml, and canvas coordinates in them would
 * be noise that a hand-written workflow never has — so the layout is derived
 * from the edges every time, and any yaml draws correctly with no bookkeeping.
 */

type NodeDoc = {
  id: string;
  type?: string;
  agent?: string;
  action?: string;
  input?: Record<string, unknown>;
  output?: string;
};

type WorkflowDoc = {
  id: string;
  name?: string;
  nodes?: NodeDoc[];
  steps?: NodeDoc[];
  edges?: { from: string; to: string; on?: string }[];
  [key: string]: unknown;
};

const NODE_TYPES = ["tool", "llm", "human_approval", "writeback"];

const inputCls =
  "w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-[color:var(--ck-text-primary)]";
const primaryBtn =
  "rounded-lg bg-[var(--ck-accent-red)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50";
const secondaryBtn =
  "rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50";

/** Longest-path depth, same rule the run view uses, so a workflow looks the
 * same whether you are editing it or watching it run. */
function depths(ids: string[], edges: GraphEdge[]): Record<string, number> {
  const depth: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  for (let pass = 0; pass < ids.length; pass++) {
    let moved = false;
    for (const edge of edges) {
      if (depth[edge.to] === undefined || depth[edge.from] === undefined) continue;
      if (depth[edge.to] < depth[edge.from] + 1) {
        depth[edge.to] = depth[edge.from] + 1;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return depth;
}

export function WorkflowEditor({
  workflowId,
  onSaved,
}: {
  workflowId: string;
  /** The team tab refreshes its own list when a workflow changes under it. */
  onSaved?: () => void;
}) {
  const [doc, setDoc] = useState<WorkflowDoc | null>(null);
  const [raw, setRaw] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showYaml, setShowYaml] = useState(false);
  /** The newest run of this workflow, so `output: copy.md` on a definition can
   * show what it actually produced. A definition has no content of its own —
   * the file only exists once something ran. */
  const [latestRun, setLatestRun] = useState<{ runId: string; status: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const out = await fetchJson<{ content: string }>(
        `/api/workflows/${encodeURIComponent(workflowId)}`, { cache: "no-store" },
      );
      setRaw(out.content ?? "");
      setDoc((parseYaml(out.content ?? "") ?? {}) as WorkflowDoc);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [workflowId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const out = await fetchJson<{ runs: { runId: string; status: string }[] }>(
          `/api/workflows/runs?workflowId=${encodeURIComponent(workflowId)}`, { cache: "no-store" },
        );
        // Newest last, matching how core lists them.
        const runs = out.runs ?? [];
        if (!cancelled) setLatestRun(runs.length ? runs[runs.length - 1] : null);
      } catch {
        // A workflow that has never run is the ordinary case, not a failure to
        // report on an editor screen.
        if (!cancelled) setLatestRun(null);
      }
    })();
    return () => { cancelled = true; };
  }, [workflowId]);

  const nodes: NodeDoc[] = useMemo(
    () => (doc?.nodes?.length ? doc.nodes : doc?.steps ?? []),
    [doc],
  );
  const isLinear = !doc?.nodes?.length && Boolean(doc?.steps?.length);
  const edges: GraphEdge[] = useMemo(() => {
    if (doc?.edges?.length) {
      return doc.edges.map((e) => ({ from: e.from, to: e.to, on: e.on ?? "success" }));
    }
    // v1 steps chain implicitly; drawing that is honest, editing it is not —
    // the edge list is disabled below for linear workflows.
    return nodes.slice(0, -1).map((n, i) => ({ from: n.id, to: nodes[i + 1].id, on: "success" }));
  }, [doc, nodes]);

  // A node's input is a mix of literals and references; a value is a file
  // reference only if some node in this workflow declares it as its output.
  const declaredOutputs = useMemo(
    () => new Set(nodes.map((n) => n.output).filter((o): o is string => Boolean(o))),
    [nodes],
  );

  const graph: RunGraph | null = useMemo(() => {
    if (!doc) return null;
    const ids = nodes.map((n) => n.id);
    const depth = depths(ids, edges);
    return {
      runId: `${workflowId}-definition`,
      workflowId,
      engine: isLinear ? "v1" : "v2",
      status: "definition",
      startedAt: null,
      completedAt: null,
      artifacts: [],
      edges,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type ?? (isLinear ? "step" : "tool"),
        agent: n.agent ?? null,
        action: n.action ?? null,
        status: "pending",
        approvalCode: null,
        delivery: null,
        deliveryError: null,
        depth: depth[n.id] ?? 0,
        output: n.output ?? null,
        inputs: Object.values(n.input ?? {}).filter(
          (v): v is string => typeof v === "string" && declaredOutputs.has(v),
        ),
      })),
    };
  }, [doc, nodes, edges, workflowId, isLinear, declaredOutputs]);

  function mutate(next: (draft: WorkflowDoc) => void) {
    setDoc((prev) => {
      if (!prev) return prev;
      const draft = JSON.parse(JSON.stringify(prev)) as WorkflowDoc;
      next(draft);
      return draft;
    });
    setMessage(null);
  }

  const node = nodes.find((n) => n.id === selected) ?? null;

  function updateNode(field: keyof NodeDoc, value: string) {
    if (!node) return;
    const previousId = node.id;
    mutate((draft) => {
      const list = draft.nodes?.length ? draft.nodes : draft.steps ?? [];
      const target = list.find((n) => n.id === previousId);
      if (!target) return;
      if (field === "id") {
        target.id = value;
        // An edge naming the old id would dangle; rename both ends with it.
        for (const edge of draft.edges ?? []) {
          if (edge.from === previousId) edge.from = value;
          if (edge.to === previousId) edge.to = value;
        }
      } else if (value) {
        (target as Record<string, unknown>)[field] = value;
      } else {
        delete (target as Record<string, unknown>)[field];
      }
    });
    if (field === "id") setSelected(value);
  }

  function addNode() {
    const id = `node_${nodes.length + 1}`;
    mutate((draft) => {
      if (!draft.nodes) draft.nodes = draft.steps?.length ? draft.steps : [];
      draft.nodes.push({ id, type: "tool" });
      if (draft.steps && draft.nodes !== draft.steps) delete draft.steps;
    });
    setSelected(id);
  }

  function removeNode() {
    if (!node) return;
    const id = node.id;
    mutate((draft) => {
      if (draft.nodes) draft.nodes = draft.nodes.filter((n) => n.id !== id);
      if (draft.steps) draft.steps = draft.steps.filter((n) => n.id !== id);
      // Edges to or from a node that no longer exists would fail validation on
      // save; dropping them here means the editor cannot build a broken file.
      if (draft.edges) draft.edges = draft.edges.filter((e) => e.from !== id && e.to !== id);
    });
    setSelected(null);
  }

  function addEdge(from: string, to: string, on: string) {
    if (!from || !to || from === to) return;
    mutate((draft) => {
      if (!draft.edges) draft.edges = [];
      if (draft.edges.some((e) => e.from === from && e.to === to && (e.on ?? "success") === on)) return;
      draft.edges.push({ from, to, on });
    });
  }

  function removeEdge(index: number) {
    mutate((draft) => {
      draft.edges?.splice(index, 1);
    });
  }

  async function save() {
    if (!doc) return;
    setSaving(true);
    setError(null);
    try {
      const content = stringifyYaml(doc);
      await fetchJson(`/api/workflows/${encodeURIComponent(workflowId)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      setRaw(content);
      setMessage("Saved. The supervisor picks it up on its next tick.");
      onSaved?.();
    } catch (e) {
      // Core refuses anything that would not run and says why — a dangling
      // edge, a cycle, an id that disagrees with the file.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (error && !doc) {
    return <p className="mt-4 text-sm text-red-400">{error}</p>;
  }
  if (!doc || !graph) {
    return <p className="mt-4 text-sm text-[color:var(--ck-text-tertiary)]">Loading…</p>;
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button className={primaryBtn} disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save workflow"}
        </button>
        <button className={secondaryBtn} onClick={addNode}>+ Node</button>
        <button className={secondaryBtn} onClick={() => setShowYaml((v) => !v)}>
          {showYaml ? "Hide yaml" : "Show yaml"}
        </button>
        {isLinear ? (
          <span className="text-xs text-[color:var(--ck-text-tertiary)]">
            Linear (v1) workflow — steps run in order; add an edge to make it a graph.
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          {message}
        </div>
      ) : null}

      <div className="ck-card p-4">
        <WorkflowGraph run={graph} selected={selected} onSelect={setSelected} neutral />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="ck-card p-4">
          <h2 className="text-sm font-medium">{node ? `Node: ${node.id}` : "Select a node"}</h2>
          {node ? (
            <div className="mt-3 space-y-2">
              <label className="block text-xs text-[color:var(--ck-text-tertiary)]">
                id
                <input className={inputCls} value={node.id}
                       onChange={(e) => updateNode("id", e.target.value)} />
              </label>
              <label className="block text-xs text-[color:var(--ck-text-tertiary)]">
                type
                <select className={inputCls} value={node.type ?? "tool"}
                        onChange={(e) => updateNode("type", e.target.value)}>
                  {NODE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="block text-xs text-[color:var(--ck-text-tertiary)]">
                agent
                <input className={inputCls} value={node.agent ?? ""} placeholder="(none)"
                       onChange={(e) => updateNode("agent", e.target.value)} />
              </label>
              <label className="block text-xs text-[color:var(--ck-text-tertiary)]">
                action
                <input className={inputCls} value={node.action ?? ""} placeholder="e.g. filesystem.read_file"
                       onChange={(e) => updateNode("action", e.target.value)} />
              </label>
              <label className="block text-xs text-[color:var(--ck-text-tertiary)]">
                output
                <input className={inputCls} value={node.output ?? ""} placeholder="name later nodes can use"
                       onChange={(e) => updateNode("output", e.target.value)} />
              </label>
              {node.output ? (
                latestRun ? (
                  <div>
                    <p className="text-[11px] text-[color:var(--ck-text-tertiary)]">
                      Latest run ({latestRun.status.replace(/_/g, " ")}):
                    </p>
                    <ArtifactPanel
                      runId={latestRun.runId}
                      name={node.output}
                      role="output"
                      editable={latestRun.status !== "running"}
                      lockedReason="That run is still going — its nodes are writing these files."
                    />
                  </div>
                ) : (
                  <p className="text-[11px] text-[color:var(--ck-text-tertiary)]">
                    {node.output} has no content yet — this workflow has not run.
                  </p>
                )
              ) : null}
              <button className={secondaryBtn} onClick={removeNode}>Delete node</button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
              Click a node in the graph to edit it.
            </p>
          )}
        </div>

        <div className="ck-card p-4">
          <h2 className="text-sm font-medium">Edges</h2>
          <p className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
            <span className="font-mono">on: error</span> routes only when the source fails — that
            branch is how a workflow recovers rather than stops.
          </p>
          <ul className="mt-2 space-y-1">
            {(doc.edges ?? []).map((edge, index) => (
              <li key={`${edge.from}->${edge.to}:${edge.on}:${index}`}
                  className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-mono text-xs">
                  {edge.from} → {edge.to}
                  <span className="ml-1 text-[color:var(--ck-text-tertiary)]">
                    on {edge.on ?? "success"}
                  </span>
                </span>
                <button className={secondaryBtn} onClick={() => removeEdge(index)}>Remove</button>
              </li>
            ))}
            {(doc.edges ?? []).length === 0 ? (
              <li className="text-xs text-[color:var(--ck-text-tertiary)]">
                No edges declared{isLinear ? " — steps run top to bottom." : "."}
              </li>
            ) : null}
          </ul>
          <EdgeAdder nodeIds={nodes.map((n) => n.id)} onAdd={addEdge} />
        </div>
      </div>

      {showYaml ? (
        <div className="ck-card p-4">
          <h2 className="text-sm font-medium">yaml (as saved)</h2>
          <pre className="mt-2 max-h-[40vh] overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs whitespace-pre-wrap">
            {stringifyYaml(doc)}
          </pre>
          {raw && stringifyYaml(doc) !== raw ? (
            <p className="mt-2 text-xs text-amber-200">Unsaved changes.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EdgeAdder({
  nodeIds,
  onAdd,
}: {
  nodeIds: string[];
  onAdd: (from: string, to: string, on: string) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [on, setOn] = useState("success");
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <select className={inputCls + " w-auto"} value={from} onChange={(e) => setFrom(e.target.value)}>
        <option value="">from…</option>
        {nodeIds.map((id) => <option key={id} value={id}>{id}</option>)}
      </select>
      <select className={inputCls + " w-auto"} value={to} onChange={(e) => setTo(e.target.value)}>
        <option value="">to…</option>
        {nodeIds.map((id) => <option key={id} value={id}>{id}</option>)}
      </select>
      <select className={inputCls + " w-auto"} value={on} onChange={(e) => setOn(e.target.value)}>
        <option value="success">on success</option>
        <option value="error">on error</option>
      </select>
      <button className={secondaryBtn} disabled={!from || !to || from === to}
              onClick={() => { onAdd(from, to, on); setFrom(""); setTo(""); }}>
        Add edge
      </button>
    </div>
  );
}
