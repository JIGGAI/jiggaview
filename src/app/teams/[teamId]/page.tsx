import { runJiggaJson } from "@/lib/jigga-cli";
import TeamEditor from "./team-editor";

export const dynamic = "force-dynamic";

type AgentListItem = {
  id: string;
  name: string;
  role: string;
  model?: string | null;
  default: boolean;
  team?: string | null;
  schedules: number;
};

export default async function TeamPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  let team: Record<string, unknown> | null = null;
  let teamAgents: AgentListItem[] = [];
  let error: string | null = null;
  try {
    const [teamDoc, allAgents] = await Promise.all([
      runJiggaJson<Record<string, unknown>>(["team", "get", teamId, "--json"]),
      runJiggaJson<AgentListItem[]>(["agents", "list", "--json"]),
    ]);
    team = teamDoc;
    teamAgents = allAgents.filter((a) => a.team === teamId);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  if (error || !team) {
    return <p className="text-sm text-red-400">{error ?? `No such team: ${teamId}`}</p>;
  }
  return <TeamEditor teamId={teamId} team={team} teamAgents={teamAgents} />;
}
