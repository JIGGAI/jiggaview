import { NextResponse } from "next/server";
import { runJiggaJson } from "@/lib/jigga-cli";

/** GET → the chat-able agent roster: every installed agent + whether it's
 * disabled (the Chat page's picker greys those out — a disabled agent still
 * queues messages but won't run until re-enabled). */

type AgentRow = { id: string; name?: string; role?: string; default?: boolean };

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
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
