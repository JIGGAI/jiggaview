import { NextResponse } from "next/server";
import { parse as parseYaml } from "yaml";
import { runJigga, runJiggaJson } from "@/lib/jigga-cli";

/** What this team's workflows have actually produced.
 *
 * A workflow run writes each step's `output:` to a file in its run directory —
 * `day_summary.md`, `calendar_events` — which is the closest thing JIGGA has to
 * a deliverable. `workflow runs --json` (JIGGA #216) lists runs from both
 * engines with those files attached; `workflow artifact` prints one.
 *
 * Scoped by the same association the Workflows tab uses, so a team page shows
 * its own output rather than the whole machine's.
 */

export type Deliverable = {
  runId: string;
  workflowId: string;
  status: string | null;
  finishedAt: string | null;
  name: string;
  bytes: number;
  modified: string | null;
};

type RunRow = {
  id: string;
  workflow_id?: string;
  status?: string | null;
  completed_at?: string | null;
  started_at?: string | null;
  artifacts?: { name: string; bytes?: number; modified?: string }[];
};

function badArg(value: string): boolean {
  return !value || value.startsWith("-");
}

/** The workflow ids belonging to this team: declared, installed, or by agent. */
async function teamWorkflowIds(teamId: string): Promise<Set<string>> {
  const [team, installed, workflows] = await Promise.all([
    runJiggaJson<Record<string, unknown>>(["team", "get", teamId, "--json"]),
    runJiggaJson<{ scaffold_id?: string; artifacts?: string[] }[]>(["recipes", "installed", "--json"])
      .catch(() => []),
    runJiggaJson<{ id: string }[]>(["workflow", "list", "--json"]).catch(() => []),
  ]);

  const ids = new Set(
    (Array.isArray(team.default_workflows) ? team.default_workflows : []).map(String),
  );
  for (const record of installed) {
    if (record.scaffold_id !== teamId) continue;
    for (const rel of record.artifacts ?? []) {
      if (rel.startsWith("workflows/")) ids.add(rel.slice("workflows/".length).replace(/\.ya?ml$/, ""));
    }
  }

  const members = new Set(
    (Array.isArray(team.agents) ? team.agents : [])
      .map((m) => String((m as { id?: unknown })?.id ?? ""))
      .filter(Boolean),
  );
  // The third signal needs each workflow's steps, so only pay for it on the
  // ones not already claimed.
  for (const row of workflows) {
    if (ids.has(row.id)) continue;
    const res = await runJigga(["workflow", "cat", row.id]);
    if (!res.ok) continue;
    try {
      const doc = parseYaml(res.stdout) as Record<string, unknown>;
      const steps = [
        ...(Array.isArray(doc?.steps) ? doc.steps : []),
        ...(Array.isArray(doc?.nodes) ? doc.nodes : []),
      ] as { agent?: unknown }[];
      if (steps.some((s) => members.has(String(s?.agent ?? "")))) ids.add(row.id);
    } catch {
      // Unparseable: it cannot claim membership it cannot demonstrate.
    }
  }
  return ids;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const teamId = (url.searchParams.get("teamId") ?? "").trim();
  const runId = (url.searchParams.get("runId") ?? "").trim();
  const name = (url.searchParams.get("name") ?? "").trim();
  if (badArg(teamId)) {
    return NextResponse.json({ error: "teamId required" }, { status: 400 });
  }

  // One artifact's content, for the viewer.
  if (runId || name) {
    if (badArg(runId) || badArg(name)) {
      return NextResponse.json({ error: "runId and name required" }, { status: 400 });
    }
    const res = await runJigga(["workflow", "artifact", runId, name]);
    if (!res.ok) {
      return NextResponse.json(
        { error: res.stdout.trim() || res.stderr.trim() || "not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ runId, name, content: res.stdout });
  }

  try {
    const [ids, runs] = await Promise.all([
      teamWorkflowIds(teamId),
      runJiggaJson<RunRow[]>(["workflow", "runs", "--json"]),
    ]);
    const deliverables: Deliverable[] = [];
    for (const run of runs) {
      if (!run.workflow_id || !ids.has(run.workflow_id)) continue;
      for (const artifact of run.artifacts ?? []) {
        deliverables.push({
          runId: run.id,
          workflowId: run.workflow_id,
          status: run.status ?? null,
          finishedAt: run.completed_at ?? run.started_at ?? null,
          name: artifact.name,
          bytes: artifact.bytes ?? 0,
          modified: artifact.modified ?? null,
        });
      }
    }
    // Newest first: the useful end of a long history.
    deliverables.sort((a, b) => String(b.modified ?? "").localeCompare(String(a.modified ?? "")));
    return NextResponse.json({ deliverables });
  } catch (e) {
    return NextResponse.json(
      { deliverables: [], error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
