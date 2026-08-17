import { NextResponse } from "next/server";
import { runJiggaJson } from "@/lib/jigga-cli";

/** GET → the chat-able agent roster. Carries what the Chat header shows about
 * who is answering — role, model, team, how many tools it may call — so the
 * page does not need a second round trip per agent to say anything about it.
 *
 * `disabled` is reported rather than filtered here: this route is the roster,
 * and which agents a given page chooses to offer is that page's decision. */

type AgentRow = {
  id: string; name?: string; role?: string; default?: boolean;
  model?: string | null; team?: string | null; tools?: string[];
};

export async function GET() {
  try {
    const [agents, disabled] = await Promise.all([
      runJiggaJson<AgentRow[]>(["agents", "list", "--json"]),
      runJiggaJson<{ agents?: string[] } | null>(["config", "get", "disabled", "--json"]).catch(
        () => null
      ),
    ]);
    const disabledSet = new Set(disabled?.agents ?? []);
    return NextResponse.json({
      ok: true,
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name ?? a.id,
        role: a.role ?? "",
        isDefault: Boolean(a.default),
        disabled: disabledSet.has(a.id),
        model: a.model ?? null,
        team: a.team ?? null,
        tools: (a.tools ?? []).length,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
