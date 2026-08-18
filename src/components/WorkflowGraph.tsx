"use client";

import type { GraphEdge, GraphNode, RunGraph } from "@/app/api/workflows/runs/route";

/** A workflow run as its actual shape.
 *
 * ClawKitchen renders a run as a status-tinted vertical list, which loses the
 * thing that makes a v2 workflow a DAG: two nodes can run off one, an `error`
 * edge can route somewhere else entirely, and a diamond rejoins. Those are
 * exactly the runs you need a picture for.
 *
 * Laid out by longest-path depth (columns) with siblings stacked (rows), drawn
 * in plain SVG — no layout library, because the graphs are small and a
 * dependency that renders boxes is a poor trade for one screen.
 */

const NODE_W = 168;
const NODE_H = 56;
const GAP_X = 76;
const GAP_Y = 22;
const PAD = 16;

const STATUS_FILL: Record<string, string> = {
  done: "rgba(16,185,129,0.16)",
  completed: "rgba(16,185,129,0.16)",
  running: "rgba(56,189,248,0.20)",
  awaiting_approval: "rgba(245,158,11,0.22)",
  failed: "rgba(239,68,68,0.20)",
  error: "rgba(239,68,68,0.20)",
  skipped: "rgba(255,255,255,0.05)",
  pending: "rgba(255,255,255,0.06)",
};

const STATUS_STROKE: Record<string, string> = {
  done: "rgba(16,185,129,0.55)",
  completed: "rgba(16,185,129,0.55)",
  running: "rgba(56,189,248,0.75)",
  awaiting_approval: "rgba(245,158,11,0.85)",
  failed: "rgba(239,68,68,0.7)",
  error: "rgba(239,68,68,0.7)",
  skipped: "rgba(255,255,255,0.15)",
  pending: "rgba(255,255,255,0.18)",
};

type Placed = GraphNode & { x: number; y: number };

/** Columns by depth, rows by order within a depth. */
function place(nodes: GraphNode[]): Placed[] {
  const byDepth = new Map<number, GraphNode[]>();
  for (const node of nodes) {
    const bucket = byDepth.get(node.depth);
    if (bucket) bucket.push(node);
    else byDepth.set(node.depth, [node]);
  }
  const placed: Placed[] = [];
  for (const [depth, group] of [...byDepth.entries()].sort(([a], [b]) => a - b)) {
    group.forEach((node, row) => {
      placed.push({ ...node, x: PAD + depth * (NODE_W + GAP_X), y: PAD + row * (NODE_H + GAP_Y) });
    });
  }
  return placed;
}

function edgePath(from: Placed, to: Placed): string {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const mid = x1 + (x2 - x1) / 2;
  // A cubic through the midpoint: straight when nodes line up, a gentle S when
  // the edge changes rows, which is what makes a fan-out readable.
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

function short(text: string, max = 22): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function WorkflowGraph({
  run,
  selected,
  onSelect,
}: {
  run: RunGraph;
  selected: string | null;
  onSelect: (nodeId: string) => void;
}) {
  const placed = place(run.nodes);
  const byId = new Map(placed.map((node) => [node.id, node]));
  const width = Math.max(...placed.map((n) => n.x + NODE_W), 200) + PAD;
  const height = Math.max(...placed.map((n) => n.y + NODE_H), 80) + PAD;

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} role="img"
           aria-label={`Workflow ${run.workflowId}, run ${run.runId}`}>
        <defs>
          <marker id="wf-arrow" markerWidth="9" markerHeight="9" refX="8" refY="3"
                  orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" fill="rgba(255,255,255,0.35)" />
          </marker>
          <marker id="wf-arrow-error" markerWidth="9" markerHeight="9" refX="8" refY="3"
                  orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" fill="rgba(239,68,68,0.6)" />
          </marker>
        </defs>

        {run.edges.map((edge: GraphEdge) => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (!from || !to) return null;
          const isError = edge.on === "error";
          return (
            <g key={`${edge.from}->${edge.to}:${edge.on}`}>
              <path
                d={edgePath(from, to)}
                fill="none"
                stroke={isError ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.25)"}
                strokeWidth={1.5}
                // An error edge is a different KIND of route, not a worse one —
                // dashed says "only on failure" without shouting.
                strokeDasharray={isError ? "5 4" : undefined}
                markerEnd={isError ? "url(#wf-arrow-error)" : "url(#wf-arrow)"}
              />
            </g>
          );
        })}

        {placed.map((node) => {
          const isSelected = selected === node.id;
          return (
            <g key={node.id} onClick={() => onSelect(node.id)} style={{ cursor: "pointer" }}>
              <rect
                x={node.x} y={node.y} width={NODE_W} height={NODE_H} rx={10}
                fill={STATUS_FILL[node.status] ?? STATUS_FILL.pending}
                stroke={isSelected ? "rgba(255,255,255,0.9)" : STATUS_STROKE[node.status] ?? STATUS_STROKE.pending}
                strokeWidth={isSelected ? 2 : 1.25}
              />
              {node.status === "running" ? (
                // The one thing a static picture cannot say: this is happening
                // NOW. Cheap CSS-free pulse via SMIL, no re-render needed.
                <rect x={node.x} y={node.y} width={NODE_W} height={NODE_H} rx={10}
                      fill="none" stroke="rgba(56,189,248,0.9)" strokeWidth={2}>
                  <animate attributeName="opacity" values="0.15;1;0.15" dur="1.6s"
                           repeatCount="indefinite" />
                </rect>
              ) : null}
              <text x={node.x + 12} y={node.y + 22} fontSize="12" fill="currentColor"
                    className="text-[color:var(--ck-text-primary)]">
                {short(node.id)}
              </text>
              <text x={node.x + 12} y={node.y + 40} fontSize="10"
                    fill="currentColor" opacity="0.65">
                {short(node.type === "human_approval" ? "approval" : node.action || node.type, 26)}
              </text>
              {node.status === "awaiting_approval" ? (
                <text x={node.x + NODE_W - 12} y={node.y + 18} fontSize="14" textAnchor="end">
                  ⏸
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export const NODE_STATUS_ORDER = [
  "running", "awaiting_approval", "failed", "error", "pending", "skipped", "done", "completed",
];
