import { NextResponse } from "next/server";
import { parse as parseYaml } from "yaml";
import { runJigga, runJiggaJson } from "@/lib/jigga-cli";

/** Which workflows belong to a team, and their yaml.
 *
 * Workflows are global — flat files in `~/.jigga/workflows/`, with no team
 * field — because the same playbook can be run by anyone. But a team page
 * needs to show the ones that are *its* work, so association is derived from
 * three signals, strongest first:
 *
 *   1. `default_workflows` in the team yaml — the team declared it
 *   2. the recipe install record — this team's scaffold wrote the file
 *   3. the steps/nodes name agents on this team — it cannot run without them
 *
 * Ranked rather than merged blindly, so the UI can say WHY a workflow is here.
 * A workflow claimed by no signal belongs to no team and simply is not listed.
 */

export type TeamWorkflow = {
  id: string;
  name: string;
  status?: string | null;
  /** Why this workflow is on this team's page. */
  via: "declared" | "installed" | "agents";
  agents: string[];
  stepCount: number;
  trigger: string | null;
};

type WorkflowRow = { id: string; name?: string; status?: string | null };
type InstallRecord = { scaffold_id?: string; artifacts?: string[] };

function badArg(value: string): boolean {
  return !value || value.startsWith("-");
}

/** A workflow's yaml, or null if it cannot be read (deleted mid-listing). */
async function workflowDoc(id: string): Promise<Record<string, unknown> | null> {
  const res = await runJigga(["workflow", "cat", id]);
  if (!res.ok) return null;
  try {
    const doc = parseYaml(res.stdout);
    return doc && typeof doc === "object" ? (doc as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Every agent a workflow names, across v1 steps and v2 nodes. */
function agentsIn(doc: Record<string, unknown>): string[] {
  const items = [
    ...(Array.isArray(doc.steps) ? doc.steps : []),
    ...(Array.isArray(doc.nodes) ? doc.nodes : []),
  ] as Array<{ agent?: unknown }>;
  return [...new Set(items.map((s) => String(s?.agent ?? "")).filter(Boolean))];
}

function triggerLabel(doc: Record<string, unknown>): string | null {
  const trigger = (doc.trigger ?? {}) as Record<string, unknown>;
  if (trigger.schedule) return `schedule: ${trigger.schedule}`;
  if (trigger.event) return `event: ${trigger.event}`;
  if (trigger.webhook) return `webhook: ${trigger.webhook}`;
  if (trigger.manual) return "manual";
  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const teamId = (url.searchParams.get("teamId") ?? "").trim();
  const id = (url.searchParams.get("id") ?? "").trim();
  if (badArg(teamId)) {
    return NextResponse.json({ error: "teamId required" }, { status: 400 });
  }

  // One workflow's raw yaml, for the editor.
  if (id) {
    if (badArg(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
    const res = await runJigga(["workflow", "cat", id]);
    if (!res.ok) {
      return NextResponse.json(
        { error: res.stdout.trim() || res.stderr.trim() || "not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ id, content: res.stdout });
  }

  try {
    const [workflows, team, installed] = await Promise.all([
      runJiggaJson<WorkflowRow[]>(["workflow", "list", "--json"]),
      runJiggaJson<Record<string, unknown>>(["team", "get", teamId, "--json"]),
      runJiggaJson<InstallRecord[]>(["recipes", "installed", "--json"]).catch(
        () => [] as InstallRecord[],
      ),
    ]);

    const declared = new Set(
      (Array.isArray(team.default_workflows) ? team.default_workflows : []).map(String),
    );
    const members = new Set(
      (Array.isArray(team.agents) ? team.agents : [])
        .map((m) => String((m as { id?: unknown })?.id ?? ""))
        .filter(Boolean),
    );
    const scaffolded = new Set(
      installed
        .filter((r) => r.scaffold_id === teamId)
        .flatMap((r) => r.artifacts ?? [])
        .filter((rel) => rel.startsWith("workflows/"))
        .map((rel) => rel.slice("workflows/".length).replace(/\.ya?ml$/, "")),
    );

    const out: TeamWorkflow[] = [];
    for (const row of workflows) {
      const doc = await workflowDoc(row.id);
      const agents = doc ? agentsIn(doc) : [];
      const mine = agents.filter((a) => members.has(a));

      let via: TeamWorkflow["via"] | null = null;
      if (declared.has(row.id)) via = "declared";
      else if (scaffolded.has(row.id)) via = "installed";
      else if (mine.length) via = "agents";
      if (!via) continue;

      out.push({
        id: row.id,
        name: row.name ?? row.id,
        status: row.status ?? null,
        via,
        agents: mine,
        stepCount: doc
          ? (Array.isArray(doc.steps) ? doc.steps.length : 0) +
            (Array.isArray(doc.nodes) ? doc.nodes.length : 0)
          : 0,
        trigger: doc ? triggerLabel(doc) : null,
      });
    }
    // Declared first: the team said these are its playbooks.
    const rank = { declared: 0, installed: 1, agents: 2 };
    out.sort((a, b) => rank[a.via] - rank[b.via] || a.id.localeCompare(b.id));
    return NextResponse.json({ workflows: out });
  } catch (e) {
    return NextResponse.json(
      { workflows: [], error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** PUT {id, content} → `workflow save` — validated in core, refused if the yaml
 * would not run (bad graph, id mismatch, unparseable), so the editor cannot
 * write something the supervisor would choke on at its next tick. */
export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { id?: string; content?: string };
  const id = String(body.id ?? "").trim();
  if (badArg(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  const res = await runJigga(["workflow", "save", id, "--content", String(body.content ?? ""),
                              "--json"]);
  if (!res.ok) {
    return NextResponse.json(
      { error: res.stdout.trim() || res.stderr.trim() || "save failed" },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(JSON.parse(res.stdout));
  } catch {
    return NextResponse.json({ ok: true });
  }
}
