import { NextResponse } from "next/server";
import { runJigga } from "@/lib/jigga-cli";

/** POST {team, member, role?} → `jigga team staff` — writes the agent
 * definition into the user-dir recipe copy (source of truth) and create-only
 * scaffolds the new agent. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    team?: string; member?: string; role?: string;
  };
  const team = String(body.team ?? "").trim();
  const member = String(body.member ?? "").trim();
  if (!team || !member || team.startsWith("-") || member.startsWith("-")) {
    return NextResponse.json({ error: "team and member required" }, { status: 400 });
  }
  const args = ["team", "staff", team, member, "--json"];
  if (body.role) args.push("--role", String(body.role));
  const res = await runJigga(args);
  if (!res.ok) {
    return NextResponse.json(
      { error: res.stderr.trim() || res.stdout.trim() || "staff failed" },
      { status: 500 },
    );
  }
  try {
    return NextResponse.json(JSON.parse(res.stdout));
  } catch {
    return NextResponse.json({ ok: true });
  }
}
