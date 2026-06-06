import Link from "next/link";
import { runJiggaJson } from "@/lib/jigga-cli";

export const dynamic = "force-dynamic";

type Agent = {
  id: string;
  name: string;
  role: string;
  model?: string | null;
  memory_scope?: string | null;
  default: boolean;
  tools: string[];
  team?: string | null;
  schedules: number;
};

export default async function AgentsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const teamId = typeof sp.team === "string" ? sp.team : "";
  let agents: Agent[] = [];
  let error: string | null = null;
  try {
    agents = await runJiggaJson<Agent[]>(["agents", "list", "--json"]);
    if (teamId) agents = agents.filter((a) => a.team === teamId);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Agents</h1>
        {teamId ? (
          <Link
            href={`/teams/${encodeURIComponent(teamId)}`}
            className="rounded-lg bg-white/10 px-3 py-1 text-xs font-medium hover:bg-white/15"
          >
            Edit team
          </Link>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
        Your AI workers{teamId ? ` — team: ${teamId}` : ""}. Declared as yaml in{" "}
        <code>~/.jigga/agents/</code>; the supervisor wakes them when there&apos;s work.
      </p>
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
          <li
            key={agent.id}
            className="rounded-xl border border-[color:var(--ck-border-subtle)] bg-white/5 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">{agent.name}</div>
                <div className="text-xs text-[color:var(--ck-text-tertiary)]">{agent.id}</div>
              </div>
              <div className="flex gap-1">
                {agent.default ? (
                  <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-xs text-sky-300">default</span>
                ) : null}
                {agent.schedules > 0 ? (
                  <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-300">
                    cron×{agent.schedules}
                  </span>
                ) : null}
              </div>
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-[color:var(--ck-text-secondary)]">{agent.role}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[color:var(--ck-text-tertiary)]">
              <span>
                team:{" "}
                {agent.team ? (
                  <Link className="underline decoration-dotted hover:text-[color:var(--ck-text-primary)]" href={`/teams/${encodeURIComponent(agent.team)}`}>
                    {agent.team}
                  </Link>
                ) : (
                  "—"
                )}
              </span>
              <span>model: {agent.model ?? "—"}</span>
              <span>tools: {agent.tools.length}</span>
              <span>memory: {agent.memory_scope ?? "—"}</span>
            </div>
          </li>
        ))}
        {agents.length === 0 && !error ? (
          <li className="text-sm text-[color:var(--ck-text-tertiary)]">No agents{teamId ? " in this team" : ""}.</li>
        ) : null}
      </ul>
    </div>
  );
}
