import Link from "next/link";
import { loadTeam, type Agent, type Team } from "./data";

/** The selected team, with the way into its board.
 *
 * Selection is a query param like everywhere else in the app, and `?team=` is
 * the same key `/tickets` and `/events` already read — so picking a team here
 * and following a link keeps the selection rather than resetting it.
 */
export async function TeamPanel({ teams, agents, teamId }: {
  teams: Team[]; agents: Agent[]; teamId: string;
}) {
  const team = teams.find((t) => t.id === teamId) ?? teams[0];
  if (!team) {
    return (
      <section className="ck-card p-4">
        <h2 className="text-sm font-semibold">Teams</h2>
        <p className="mt-2 text-sm text-[color:var(--ck-text-tertiary)]">
          No teams yet. <Link href="/recipes" className="hover:underline">Install one from a recipe →</Link>
        </p>
      </section>
    );
  }

  const { lanes, tickets } = await loadTeam(team.id);
  const byLane = new Map<string, number>();
  for (const ticket of tickets) {
    const lane = ticket.lane ?? "(no lane)";
    byLane.set(lane, (byLane.get(lane) ?? 0) + 1);
  }
  const members = (team.members ?? []).map(
    (id) => agents.find((a) => a.id === id) ?? { id, name: id } as Agent);

  return (
    <section className="ck-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Teams</h2>
        <Link href={`/teams/${encodeURIComponent(team.id)}`}
              className="text-xs text-[color:var(--ck-text-tertiary)] hover:underline">
          open team →
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {teams.map((entry) => {
          const selected = entry.id === team.id;
          const roster = entry.members ?? [];
          // Count members that still EXIST as agents. Core keeps a roster entry
          // after its agent is deleted, on purpose — workflows and handoffs may
          // still name it — so the roster length can be larger than the number
          // of agents that can actually be woken.
          const live = roster.filter((id) => agents.some((a) => a.id === id));
          const missing = roster.length - live.length;
          return (
            <Link
              key={entry.id}
              href={`/dashboard?team=${encodeURIComponent(entry.id)}`}
              aria-current={selected ? "true" : undefined}
              className={"rounded-xl border p-3 transition-colors " + (selected
                ? "border-[color:var(--ck-border-strong)] bg-white/10"
                : "border-[color:var(--ck-border-subtle)] bg-white/[0.03] hover:bg-white/[0.07]")}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium leading-tight">{entry.name}</span>
                {selected ? (
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--ck-accent-red)]" />
                ) : null}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-[color:var(--ck-text-tertiary)]">
                {entry.id}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs
                              text-[color:var(--ck-text-secondary)]">
                <span className="tabular-nums">
                  {live.length} agent{live.length === 1 ? "" : "s"}
                </span>
                {missing > 0 ? (
                  <span className="text-amber-300" title="Roster entries whose agent no longer exists">
                    {missing} missing
                  </span>
                ) : null}
                {entry.lead ? (
                  <span className="truncate text-[color:var(--ck-text-tertiary)]">
                    lead: {entry.lead}
                  </span>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          {team.purpose ? (
            <p className="text-sm text-[color:var(--ck-text-secondary)]">{team.purpose}</p>
          ) : null}
          <dl className="mt-3 space-y-1 text-xs">
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-[color:var(--ck-text-tertiary)]">lead</dt>
              <dd>{team.lead ?? "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-[color:var(--ck-text-tertiary)]">members</dt>
              <dd className="flex flex-wrap gap-1.5">
                {members.length === 0 ? "—" : members.map((member) => (
                  <Link key={member.id} href={`/agents/${encodeURIComponent(member.id)}`}
                        className="rounded bg-white/5 px-1.5 py-0.5 hover:bg-white/10">
                    {member.id}
                  </Link>
                ))}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-[color:var(--ck-text-tertiary)]">tickets</dt>
              <dd>{tickets.length}</dd>
            </div>
          </dl>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-xs uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">Board</h3>
            <Link href={`/tickets?team=${encodeURIComponent(team.id)}`}
                  className="text-xs text-[color:var(--ck-text-tertiary)] hover:underline">
              open board →
            </Link>
          </div>
          {lanes.length === 0 ? (
            <p className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
              This team has no lanes declared, so it has no board.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {lanes.map((lane) => (
                <li key={lane.id}>
                  <Link href={`/tickets?team=${encodeURIComponent(team.id)}&lane=${encodeURIComponent(lane.id)}`}
                        className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-2.5 py-1.5 text-sm hover:bg-white/10">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{lane.id}</span>
                      {/* A gated lane is one only a named role can move work out
                          of — worth seeing on the board summary, not just in yaml. */}
                      {lane.gate ? (
                        <span className="shrink-0 rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] text-purple-200">
                          gate: {lane.gate}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 tabular-nums text-[color:var(--ck-text-tertiary)]">
                      {byLane.get(lane.id) ?? 0}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
