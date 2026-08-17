import { NextResponse } from "next/server";
import { runJigga, runJiggaJson } from "@/lib/jigga-cli";

/** The Memory tab ↔ team memory boundary (core `jigga team memory`).
 *
 * GET  ?teamId=&pinned=1        → `team memory list <team> [--pinned] --json`
 * POST {teamId, text, type?, tags?} → `team memory add`
 * POST {teamId, entryId}        → `team memory pin`
 *
 * This is the same store agents write through `memory.remember`, so an entry
 * added here is indistinguishable to them from one they wrote — except for its
 * `source`, which core records as the human rather than an agent.
 */

export type MemoryEntry = {
  id: string;
  time: string;
  type: string;
  text: string;
  tags?: string[];
  source?: Record<string, unknown>;
  pinned_at?: string;
};

/** Reject anything argv-shaped before it reaches execFile. */
function badArg(value: string): boolean {
  return !value || value.startsWith("-");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const teamId = (url.searchParams.get("teamId") ?? "").trim();
  const pinned = url.searchParams.get("pinned") === "1";
  if (badArg(teamId)) {
    return NextResponse.json({ error: "teamId required" }, { status: 400 });
  }
  const args = ["team", "memory", "list", teamId, "--json"];
  if (pinned) args.push("--pinned");
  try {
    return NextResponse.json({ entries: await runJiggaJson<MemoryEntry[]>(args) });
  } catch (e) {
    return NextResponse.json(
      { entries: [], error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    teamId?: string; text?: string; type?: string; tags?: string[]; entryId?: string;
  };
  const teamId = String(body.teamId ?? "").trim();
  if (badArg(teamId)) {
    return NextResponse.json({ error: "teamId required" }, { status: 400 });
  }

  // Pin: escalate an existing entry into the curated subset. Core is
  // idempotent here, so a double-click reports already_pinned rather than
  // writing the same fact into pinned.jsonl twice.
  const entryId = String(body.entryId ?? "").trim();
  if (entryId) {
    if (badArg(entryId)) {
      return NextResponse.json({ error: "invalid entry id" }, { status: 400 });
    }
    return respond(await runJigga(["team", "memory", "pin", teamId, entryId, "--json"]));
  }

  const text = String(body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }
  const type = String(body.type ?? "fact").trim() || "fact";
  if (badArg(type)) {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }
  const args = ["team", "memory", "add", teamId, "--text", text, "--type", type, "--json"];
  for (const tag of body.tags ?? []) {
    const clean = String(tag).trim();
    // Skip rather than reject: a stray tag should not lose the user's text.
    if (clean && !clean.startsWith("-")) args.push("--tag", clean);
  }
  return respond(await runJigga(args));
}

function respond(res: { ok: boolean; stdout: string; stderr: string; exitCode: number }) {
  if (!res.ok) {
    return NextResponse.json(
      { error: res.stderr.trim() || res.stdout.trim() || `jigga exited ${res.exitCode}` },
      { status: 500 },
    );
  }
  try {
    return NextResponse.json(JSON.parse(res.stdout));
  } catch {
    return NextResponse.json({ ok: true });
  }
}
