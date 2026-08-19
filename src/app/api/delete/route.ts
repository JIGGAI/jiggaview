import { NextResponse } from "next/server";
import { runJigga, runJiggaJson } from "@/lib/jigga-cli";

/** Deleting an agent or a team.
 *
 * GET  ?kind=&id=  → what deleting it would remove, so the confirmation can
 *                    name it instead of asking for a leap of faith.
 * POST {kind, id}  → `jigga agents|team delete`.
 *
 * Deleting a TEAM is not just its yaml: core also removes the agents and
 * workflows the team's install record OWNS. Someone clicking "delete team"
 * expecting to lose one file can lose four agents, so the preview exists to
 * put that on screen BEFORE the click, not in the audit log afterwards.
 */

const BASE: Record<string, string[]> = { agent: ["agents"], team: ["team"] };

type InstallRecord = { scaffold_id?: string; kind?: string; artifacts?: string[] };

function badArg(value: string): boolean {
  return !value || value.startsWith("-");
}

/** What core would remove, derived from the same install record it reads. */
async function preview(kind: string, id: string) {
  const always = kind === "team"
    ? [`teams/${id}.yaml`, `workspaces/${id}`]
    : [`agents/${id}.yaml`, `workspaces/*/roles/${id}`];

  if (kind !== "team") return { removes: always, agents: [], workflows: [] };

  let records: InstallRecord[] = [];
  try {
    records = await runJiggaJson<InstallRecord[]>(["recipes", "installed", "--json"]);
  } catch {
    // No record is the hand-made-team case: yaml + workspace only, which is
    // exactly what `always` already says.
    return { removes: always, agents: [], workflows: [] };
  }
  const owned = (records.find((r) => r.scaffold_id === id)?.artifacts ?? [])
    .filter((rel) => rel !== `teams/${id}.yaml`);
  return {
    removes: [...owned, ...always],
    agents: owned.filter((rel) => rel.startsWith("agents/"))
      .map((rel) => rel.slice("agents/".length).replace(/\.yaml$/, "")),
    workflows: owned.filter((rel) => rel.startsWith("workflows/"))
      .map((rel) => rel.slice("workflows/".length).replace(/\.yaml$/, "")),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = (url.searchParams.get("kind") ?? "").trim();
  const id = (url.searchParams.get("id") ?? "").trim();
  if (!BASE[kind] || badArg(id)) {
    return NextResponse.json({ error: "kind and id required" }, { status: 400 });
  }
  return NextResponse.json({ kind, id, ...(await preview(kind, id)) });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { kind?: string; id?: string };
  const kind = String(body.kind ?? "").trim();
  const id = String(body.id ?? "").trim();
  const base = BASE[kind];
  if (!base || badArg(id)) {
    return NextResponse.json({ error: "kind and id required" }, { status: 400 });
  }
  const res = await runJigga([...base, "delete", id, "--json"]);
  if (!res.ok) {
    return NextResponse.json(
      { error: res.stderr.trim() || res.stdout.trim() || "delete failed" },
      { status: 500 },
    );
  }
  try {
    return NextResponse.json(JSON.parse(res.stdout));
  } catch {
    return NextResponse.json({ ok: true });
  }
}
