import { NextResponse } from "next/server";
import { runJigga } from "@/lib/jigga-cli";

/** POST {team, agent, role?, memberId?} → `jigga team add-agent` — copy an
 * existing agent's config into this team as a new member and scaffold it. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    team?: string; agent?: string; role?: string; memberId?: string;
  };
  const team = String(body.team ?? "").trim();
  const agent = String(body.agent ?? "").trim();
  if (!team || team.startsWith("-") || !agent || agent.startsWith("-")) {
    return NextResponse.json({ error: "team and agent required" }, { status: 400 });
  }
  const args = ["team", "add-agent", team, agent, "--json"];
  if (body.role && String(body.role).trim()) args.push("--role", String(body.role).trim());
  if (body.memberId && String(body.memberId).trim()) args.push("--member-id", String(body.memberId).trim());
  const res = await runJigga(args);
  if (!res.ok) {
    let message = res.stdout.trim() || res.stderr.trim() || `add-agent failed (exit=${res.exitCode})`;
    try {
      const parsed = JSON.parse(res.stdout) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      // non-JSON stdout — keep the raw message
    }
    const status = /already has a member/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
  try {
    return NextResponse.json(JSON.parse(res.stdout));
  } catch {
    return NextResponse.json({ ok: true });
  }
}
