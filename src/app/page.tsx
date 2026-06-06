import Link from "next/link";
import { runJiggaJson } from "@/lib/jigga-cli";

export const dynamic = "force-dynamic";

type Agent = {
  id: string;
  name: string;
  role: string;
  model?: string | null;
  default: boolean;
  team?: string | null;
};
type Team = { id: string; name: string };

/** ClawKitchen's home: installed agents grouped by team workspace —
 * section per team (Edit → team editor), agent cards into the editor. */
export default async function HomePage() {
  let agents: Agent[] = [];
  let teams: Team[] = [];
  let error: string | null = null;
  try {
    [agents, teams] = await Promise.all([
      runJiggaJson<Agent[]>(["agents", "list", "--json"]),
      runJiggaJson<Team[]>(["team", "list", "--json"]),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const teamNames = new Map(teams.map((t) => [t.id, t.name]));
  const groups = new Map<string, Agent[]>();
  for (const agent of agents) {
    // solo agents resolve team == their own id → group those under personal
    const key = agent.team && teamNames.has(agent.team) ? agent.team : "personal";
    groups.set(key, [...(groups.get(key) ?? []), agent]);
  }
  const ordered = [...groups.keys()].sort((a, b) =>
    a === "personal" ? 1 : b === "personal" ? -1 : a.localeCompare(b),
  );

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold">Agents</h1>
          <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
            Installed agents grouped by team workspace
          </p>
        </div>
      </div>
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {ordered.map((teamId) => {
        const isTeam = teamId !== "personal";
        const sectionAgents = (groups.get(teamId) ?? []).sort((a, b) => a.id.localeCompare(b.id));
        return (
          <section key={teamId} className="mt-8">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  {isTeam ? teamNames.get(teamId) ?? teamId : "Personal / Unassigned"}
                </h2>
                {isTeam ? (
                  <div className="font-mono text-xs text-[color:var(--ck-text-tertiary)]">
                    workspaces/{teamId}
                  </div>
                ) : null}
              </div>
              {isTeam ? (
                <Link
                  href={`/teams/${encodeURIComponent(teamId)}`}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
                >
                  Edit
                </Link>
              ) : null}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sectionAgents.map((agent) => (
                <Link
                  key={agent.id}
                  href={`/agents/${encodeURIComponent(agent.id)}?returnTo=/`}
                  className="ck-card block p-4 transition hover:border-[color:var(--ck-border-strong)]"
                >
                  <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">
                    {agent.name || agent.id}
                    {agent.default ? (
                      <span className="text-[color:var(--ck-text-tertiary)]"> · default</span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-[color:var(--ck-text-tertiary)]">{agent.id}</div>
                  {agent.model ? (
                    <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">· {agent.model}</div>
                  ) : null}
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
