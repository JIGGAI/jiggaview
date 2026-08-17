import { NextResponse } from "next/server";
import { runJigga, runJiggaJson } from "@/lib/jigga-cli";

const BASE: Record<string, string[]> = { agent: ["agents"], team: ["team"] };

export type WorkspaceFile = {
  name: string;
  missing: boolean;
  required?: boolean;
  bytes?: number;
  modified?: string;
};

type ManifestEntry = { name: string; missing: boolean; required?: boolean };

/** Everything actually in the workspace, plus the required files that aren't.
 *
 * `team files` answers "is this team set up correctly" from a fixed manifest of
 * four paths, so a runtime file — role memory, an agent output, the team's own
 * memory jsonl — appeared nowhere, at any depth. `team workspace --json`
 * (JIGGA #202) walks the real tree. Merging the two keeps the scaffolding
 * checklist (a required file that is missing still has to be visible, and by
 * definition it cannot be in a listing of what exists).
 */
async function workspaceTree(teamId: string): Promise<WorkspaceFile[]> {
  const [listing, manifest] = await Promise.all([
    runJiggaJson<{ files: WorkspaceFile[] }>(["team", "workspace", teamId, "--json"]),
    runJiggaJson<ManifestEntry[]>(["team", "files", teamId, "--json"]).catch(() => [] as ManifestEntry[]),
  ]);
  const required = new Set(manifest.filter((f) => f.required).map((f) => f.name));
  const present = (listing.files ?? []).map((f) => ({
    ...f,
    missing: false,
    required: required.has(f.name),
  }));
  const names = new Set(present.map((f) => f.name));
  const missing = manifest
    .filter((f) => f.missing && !names.has(f.name))
    .map((f) => ({ name: f.name, missing: true, required: f.required }));
  return [...present, ...missing].sort((a, b) => a.name.localeCompare(b.name));
}

/** GET ?kind=&id=            → file listing (required/optional/missing)
 *  GET ?kind=team&id=&tree=1 → every file in the workspace + missing required
 *  GET ?kind=&id=&name=      → one file's content
 *  PUT {kind, id, name, content} → write (workspace-confined + audited in core) */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "";
  const base = BASE[kind];
  const id = (url.searchParams.get("id") ?? "").trim();
  const name = (url.searchParams.get("name") ?? "").trim();
  const tree = url.searchParams.get("tree") === "1";
  if (!base || !id || id.startsWith("-") || name.startsWith("-")) {
    return NextResponse.json({ ok: false, error: "kind and id required" }, { status: 400 });
  }
  try {
    if (!name && tree && kind === "team") {
      return NextResponse.json({ ok: true, files: await workspaceTree(id) });
    }
    if (!name) {
      const files = await runJiggaJson<unknown[]>([...base, "files", id, "--json"]);
      return NextResponse.json({ ok: true, files });
    }
    const res = await runJigga([...base, "file", "get", id, name, "--json"]);
    if (!res.ok) return NextResponse.json({ ok: true, content: "", missing: true });
    const parsed = JSON.parse(res.stdout) as { content?: string };
    return NextResponse.json({ ok: true, content: parsed.content ?? "" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    kind?: string; id?: string; name?: string; content?: string;
  };
  const base = BASE[String(body.kind ?? "")];
  const id = String(body.id ?? "").trim();
  const name = String(body.name ?? "").trim();
  if (!base || !id || !name || id.startsWith("-") || name.startsWith("-")) {
    return NextResponse.json({ ok: false, error: "kind, id and name required" }, { status: 400 });
  }
  const res = await runJigga([...base, "file", "set", id, name, "--content", String(body.content ?? "")]);
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: res.stderr.trim() || res.stdout.trim() || "write failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
