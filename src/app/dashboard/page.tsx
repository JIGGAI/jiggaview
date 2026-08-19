import Link from "next/link";
import { lastSeen, loadOverview, working } from "./data";
import { Health, PluginsPanel, StatCard, WorkflowReport, WorkingNow } from "./panels";
import { TeamPanel } from "./team-panel";

export const dynamic = "force-dynamic";

/** What the runtime is, and what it is doing.
 *
 * Every number is read from `~/.jigga` at request time through the CLI — same
 * source the agents use, no cache to go stale and no second copy to disagree
 * with the runtime.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const teamId = typeof sp.team === "string" ? sp.team : "";
  const { teams, agents, plugins, workflows, runs, tasks, checks } = await loadOverview();

  const busy = working(tasks);
  const enabledAgents = agents.filter((a) => !a.disabled);
  const pluginsRunning = plugins.filter((p) => p.running).length;
  const parked = runs.filter((r) => r.status === "awaiting_approval").length;
  const queued = tasks.filter((t) => t.state === "pending").length;

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-xs text-[color:var(--ck-text-tertiary)]">
          Read from your runtime&apos;s files at load — nothing here is cached.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Teams" value={teams.length} href="/teams"
                  hint={teams.length ? teams.map((t) => t.id).slice(0, 2).join(", ") : "none yet"} />
        <StatCard label="Agents" value={enabledAgents.length} href="/"
                  hint={agents.length !== enabledAgents.length
                    ? `${agents.length - enabledAgents.length} disabled`
                    : `${busy.length} working now`} />
        <StatCard label="Workflows" value={workflows.length} href="/workflows"
                  hint={parked ? `${parked} awaiting approval` : `${runs.length} runs recorded`} />
        <StatCard label="Plugins" value={plugins.length} href="/plugins"
                  hint={`${pluginsRunning} running`} />
      </div>

      {queued > 0 ? (
        <Link href="/events?tab=tasks&state=pending"
              className="mt-4 block rounded-xl border border-sky-400/30 bg-sky-500/10 p-3 text-sm text-sky-100 hover:bg-sky-500/15">
          {queued} task{queued === 1 ? "" : "s"} queued for the next supervisor tick →
        </Link>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WorkingNow working={busy} lastSeen={lastSeen(tasks)} agents={agents} />
        <WorkflowReport workflows={workflows} runs={runs} />
      </div>

      <div className="mt-4">
        <TeamPanel teams={teams} agents={agents} teamId={teamId} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PluginsPanel plugins={plugins} />
        <Health checks={checks} />
      </div>
    </div>
  );
}
