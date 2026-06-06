import { runJiggaJson } from "@/lib/jigga-cli";
import AgentEditor from "./agent-editor";

export const dynamic = "force-dynamic";

export default async function AgentPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  let agent: Record<string, unknown> | null = null;
  let disabled = false;
  let error: string | null = null;
  try {
    const [doc, disabledCfg] = await Promise.all([
      runJiggaJson<Record<string, unknown>>(["agents", "get", agentId, "--json"]),
      runJiggaJson<{ agents?: string[] } | null>(["config", "get", "disabled", "--json"]),
    ]);
    agent = doc;
    disabled = Boolean(disabledCfg?.agents?.includes(agentId));
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  if (error || !agent) {
    return <p className="text-sm text-red-400">{error ?? `No such agent: ${agentId}`}</p>;
  }
  return <AgentEditor agentId={agentId} agent={agent} disabled={disabled} />;
}
