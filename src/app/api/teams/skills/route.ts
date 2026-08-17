import { NextResponse } from "next/server";
import { runJiggaJson } from "@/lib/jigga-cli";

/** What this team can actually DO — every member's effective toolset.
 *
 * ClawKitchen has a team-level "Skills" tab because skills install into a team
 * workspace there. JIGGA works differently: skills are global capability packs,
 * and what an agent may call is a per-agent grant that defaults to nothing.
 * Porting the ClawKitchen shape would have invented a team-level install that
 * the runtime does not have.
 *
 * So this answers the question the tab is really for — "what is this team able
 * to do, and where does it stop" — from `agents tools`, which reports the
 * EFFECTIVE set: granted, registered, and permitted, with the status of each.
 * Read-only by design: a grant is a security boundary, so it is changed on the
 * agent's own page, not in a team-wide bulk editor.
 */

export type ToolGrant = {
  action: string;
  capability: string | null;
  status: string;          // ready | needs_approval | missing | …
  risk_level: string | null;
  reason: string | null;
};

export type MemberTools = {
  id: string;
  tools: ToolGrant[];
  error?: string;
};

export type Skill = { name: string; summary?: string | null };

function badArg(value: string): boolean {
  return !value || value.startsWith("-");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const teamId = (url.searchParams.get("teamId") ?? "").trim();
  if (badArg(teamId)) {
    return NextResponse.json({ error: "teamId required" }, { status: 400 });
  }

  try {
    const team = await runJiggaJson<{ agents?: { id?: string }[] }>(
      ["team", "get", teamId, "--json"],
    );
    const memberIds = (team.agents ?? [])
      .map((m) => String(m?.id ?? ""))
      .filter((id) => id && !id.startsWith("-"));

    const members: MemberTools[] = await Promise.all(
      memberIds.map(async (id) => {
        try {
          return { id, tools: await runJiggaJson<ToolGrant[]>(["agents", "tools", id, "--json"]) };
        } catch (e) {
          // A member on the roster with no agent yaml yet (membership-only) is
          // normal — report it per member rather than failing the whole tab.
          return { id, tools: [], error: e instanceof Error ? e.message : String(e) };
        }
      }),
    );

    // Skills are a global catalog; showing them here says what this team COULD
    // be granted, which is the other half of "where does it stop".
    const catalog = await runJiggaJson<{ skills?: Skill[]; pending_approval?: Skill[] }>(
      ["skills", "list", "--json"],
    ).catch(() => ({ skills: [], pending_approval: [] }));

    return NextResponse.json({
      members,
      skills: catalog.skills ?? [],
      pendingSkills: catalog.pending_approval ?? [],
    });
  } catch (e) {
    return NextResponse.json(
      { members: [], skills: [], pendingSkills: [],
        error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
