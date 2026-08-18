import { NextResponse } from "next/server";
import { parse as parseYaml } from "yaml";
import { runJigga, runJiggaJson } from "@/lib/jigga-cli";

/** Workflow runs, with the topology needed to draw them.
 *
 * A run record carries per-node STATE (`nodes: {id: {status, approval_code}}`)
 * but not the graph — the shape lives in the workflow yaml as `nodes` + `edges`
 * (`on: success | error`). Drawing a run means joining the two, so this route
 * returns both rather than making the client fetch and reconcile them.
 *
 * v1 runs have no graph at all; they are a linear list of steps. They are
 * returned too (JIGGA #216 made them visible) and rendered as the chain they
 * are, because half a history is worse than none.
 */

export type GraphNode = {
  id: string;
  type: string;
  agent: string | null;
  action: string | null;
  status: string;
  approvalCode: string | null;
  /** Undelivered means nobody was ASKED — a different state from unanswered. */
  delivery: string | null;
  deliveryError: string | null;
  /** Layer in the DAG, for layout. */
  depth: number;
};

export type GraphEdge = { from: string; to: string; on: string };

export type RunGraph = {
  runId: string;
  workflowId: string;
  engine: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  artifacts: { name: string; bytes?: number }[];
};

type RunRow = {
  id: string;
  workflow_id?: string;
  engine?: string;
  status?: string;
  created_at?: string;
  started_at?: string;
  completed_at?: string | null;
  nodes?: Record<string, { status?: string; approval_code?: string; delivery?: string;
                           delivery_error?: string }>;
  artifacts?: { name: string; bytes?: number }[];
};

function badArg(value: string): boolean {
  return !value || value.startsWith("-");
}

/** Longest-path depth per node, so a diamond renders as a diamond.
 *
 * Cycles cannot reach here (core rejects them at save time), but a malformed
 * file could still arrive, so the walk is bounded by the node count rather
 * than trusting the graph to terminate.
 */
function depths(nodeIds: string[], edges: GraphEdge[]): Record<string, number> {
  const depth: Record<string, number> = Object.fromEntries(nodeIds.map((id) => [id, 0]));
  for (let pass = 0; pass < nodeIds.length; pass++) {
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

async function topology(workflowId: string): Promise<{ nodes: Record<string, {
  type: string; agent: string | null; action: string | null }>; edges: GraphEdge[] }> {
  const res = await runJigga(["workflow", "cat", workflowId]);
  if (!res.ok) return { nodes: {}, edges: [] };
  let doc: Record<string, unknown>;
  try {
    doc = (parseYaml(res.stdout) ?? {}) as Record<string, unknown>;
  } catch {
    return { nodes: {}, edges: [] };
  }
  const nodes: Record<string, { type: string; agent: string | null; action: string | null }> = {};
  // v2 `nodes`, else v1 `steps` — a step is a node with one implicit edge to
  // the next, which is exactly how it gets drawn below.
  const raw = (Array.isArray(doc.nodes) && doc.nodes.length ? doc.nodes : doc.steps) as
    | { id?: string; type?: string; agent?: string; action?: string }[]
    | undefined;
  for (const item of raw ?? []) {
    if (!item?.id) continue;
    nodes[String(item.id)] = {
      type: String(item.type ?? "tool"),
      agent: item.agent ? String(item.agent) : null,
      action: item.action ? String(item.action) : null,
    };
  }
  let edges: GraphEdge[] = [];
  if (Array.isArray(doc.edges) && doc.edges.length) {
    edges = (doc.edges as { from?: string; to?: string; on?: string }[])
      .filter((e) => e?.from && e?.to)
      .map((e) => ({ from: String(e.from), to: String(e.to), on: String(e.on ?? "success") }));
  } else {
    const ids = Object.keys(nodes);
    edges = ids.slice(0, -1).map((from, i) => ({ from, to: ids[i + 1], on: "success" }));
  }
  return { nodes, edges };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const workflowId = (url.searchParams.get("workflowId") ?? "").trim();
  const activeOnly = url.searchParams.get("active") === "1";
  if (workflowId && badArg(workflowId)) {
    return NextResponse.json({ error: "invalid workflowId" }, { status: 400 });
  }

  const args = ["workflow", "runs", "--json"];
  if (workflowId) args.splice(2, 0, workflowId);
  if (activeOnly) args.push("--active");

  try {
    const runs = await runJiggaJson<RunRow[]>(args);
    // Topology is per workflow, not per run — fetch each yaml once.
    const shapes = new Map<string, Awaited<ReturnType<typeof topology>>>();
    const graphs: RunGraph[] = [];
    for (const run of runs) {
      const wf = run.workflow_id ?? "";
      if (!shapes.has(wf)) shapes.set(wf, await topology(wf));
      const shape = shapes.get(wf)!;
      const state = run.nodes ?? {};
      // Union of both sides: a node the yaml lost still has state worth
      // showing, and a node never reached still belongs on the diagram.
      const ids = [...new Set([...Object.keys(shape.nodes), ...Object.keys(state)])];
      const edges = shape.edges.filter((e) => ids.includes(e.from) && ids.includes(e.to));
      const depth = depths(ids, edges);
      graphs.push({
        runId: run.id,
        workflowId: wf,
        engine: run.engine ?? "v1",
        status: run.status ?? "unknown",
        startedAt: run.created_at ?? run.started_at ?? null,
        completedAt: run.completed_at ?? null,
        nodes: ids.map((id) => ({
          id,
          type: shape.nodes[id]?.type ?? "step",
          agent: shape.nodes[id]?.agent ?? null,
          action: shape.nodes[id]?.action ?? null,
          status: state[id]?.status ?? (run.engine === "v2" ? "pending" : "done"),
          approvalCode: state[id]?.approval_code ?? null,
          delivery: state[id]?.delivery ?? null,
          deliveryError: state[id]?.delivery_error ?? null,
          depth: depth[id] ?? 0,
        })),
        edges,
        artifacts: run.artifacts ?? [],
      });
    }
    graphs.sort((a, b) => String(b.startedAt ?? "").localeCompare(String(a.startedAt ?? "")));
    return NextResponse.json({ runs: graphs });
  } catch (e) {
    return NextResponse.json(
      { runs: [], error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** POST {runId, code, decision} — resolve a parked approval and advance the run.
 *
 * Two commands, because they are two facts: the approval is answered, and the
 * run is told to continue. Resuming without waiting for the next tick is the
 * whole point of approving from a screen you are already looking at.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    runId?: string; code?: string; decision?: string;
  };
  const runId = String(body.runId ?? "").trim();
  const code = String(body.code ?? "").trim();
  const decision = String(body.decision ?? "").trim();
  if (badArg(runId) || badArg(code) || !["approve", "deny"].includes(decision)) {
    return NextResponse.json(
      { error: "runId, code and decision (approve|deny) required" }, { status: 400 },
    );
  }

  const resolved = await runJigga(["approvals", decision, code]);
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.stderr.trim() || resolved.stdout.trim() || `${decision} failed` },
      { status: 500 },
    );
  }
  // Advance now rather than at the next heartbeat.
  const resumed = await runJigga(["workflow", "resume", runId]);
  if (!resumed.ok) {
    return NextResponse.json({
      ok: true,
      decision,
      warning: `Recorded the ${decision}, but resuming failed: ` +
               (resumed.stderr.trim() || resumed.stdout.trim() ||
                "the supervisor will pick it up on its next tick."),
    });
  }
  return NextResponse.json({ ok: true, decision });
}
