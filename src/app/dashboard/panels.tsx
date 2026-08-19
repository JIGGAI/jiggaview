import Link from "next/link";
import type { Agent, Check, Plugin, Task, Workflow, WorkflowRun } from "./data";

/** Dashboard panels. Server components — every number here is read from the
 * runtime's own files at request time, not cached or estimated. */

const CARD = "ck-card p-4";
const LABEL = "text-xs uppercase tracking-wide text-[color:var(--ck-text-tertiary)]";

export function StatCard({ label, value, hint, href }: {
  label: string; value: number | string; hint?: string; href?: string;
}) {
  const body = (
    <>
      <div className={LABEL}>{label}</div>
      <div className="mt-2 text-4xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs text-[color:var(--ck-text-secondary)]">{hint}</div> : null}
    </>
  );
  return href ? (
    <Link href={href} className={`${CARD} block transition-colors hover:border-[color:var(--ck-border-strong)]`}>
      {body}
    </Link>
  ) : <div className={CARD}>{body}</div>;
}

/** Who is working, and on what.
 *
 * When nothing is running this shows each agent's LAST task instead of an empty
 * box. On a healthy install nothing is running most of the time, and "nothing is
 * running" on its own cannot be told apart from "nothing ever runs".
 */
export function WorkingNow({ working, lastSeen, agents }: {
  working: Task[]; lastSeen: Map<string, Task>; agents: Agent[];
}) {
  const enabled = agents.filter((a) => !a.disabled);
  return (
    <section className={CARD}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Working now</h2>
        <span className="text-xs text-[color:var(--ck-text-tertiary)]">
          {working.length > 0
            ? `${working.length} of ${enabled.length} agents busy`
            : `${enabled.length} agents idle`}
        </span>
      </div>

      {working.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {working.map((task) => (
            <li key={task.id} className="flex items-start gap-3 rounded-lg bg-white/5 p-2.5">
              <span className="mt-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-400" />
              <div className="min-w-0">
                <Link href={`/agents/${encodeURIComponent(task.assignee ?? "")}`}
                      className="font-medium hover:underline">
                  {task.assignee ?? "unassigned"}
                </Link>
                <div className="truncate text-sm text-[color:var(--ck-text-secondary)]">{task.title}</div>
                <div className="text-xs text-[color:var(--ck-text-tertiary)]">{task.state} · {task.id}</div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-[color:var(--ck-text-secondary)]">
            Nothing running. The supervisor wakes agents on a tick — here is what each did last.
          </p>
          <ul className="mt-2 divide-y divide-[color:var(--ck-border-subtle)]">
            {enabled.slice(0, 6).map((agent) => {
              const last = lastSeen.get(agent.id);
              return (
                <li key={agent.id} className="flex items-baseline justify-between gap-3 py-1.5">
                  <Link href={`/agents/${encodeURIComponent(agent.id)}`}
                        className="shrink-0 text-sm hover:underline">{agent.id}</Link>
                  <span className="truncate text-xs text-[color:var(--ck-text-tertiary)]">
                    {last ? `${last.state} · ${last.title}` : "no tasks yet"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

const RUN_BADGE: Record<string, string> = {
  completed: "bg-emerald-500/20 text-emerald-300",
  running: "bg-sky-500/20 text-sky-300",
  awaiting_approval: "bg-amber-500/20 text-amber-300",
  failed: "bg-red-500/20 text-red-300",
};

export function WorkflowReport({ workflows, runs }: { workflows: Workflow[]; runs: WorkflowRun[] }) {
  const counts = new Map<string, number>();
  for (const run of runs) counts.set(run.status ?? "unknown", (counts.get(run.status ?? "unknown") ?? 0) + 1);
  const parked = runs.filter((r) => r.status === "awaiting_approval");
  const recent = [...runs].reverse().slice(0, 5);

  return (
    <section className={CARD}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Workflows</h2>
        <Link href="/workflows" className="text-xs text-[color:var(--ck-text-tertiary)] hover:underline">
          all workflows →
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs">{workflows.length} defined</span>
        {[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([status, count]) => (
          <span key={status} className={`rounded-full px-2.5 py-1 text-xs ${RUN_BADGE[status] ?? "bg-white/10"}`}>
            {count} {status.replace(/_/g, " ")}
          </span>
        ))}
      </div>

      {parked.length > 0 ? (
        // A parked run is the one workflow state that is waiting on a PERSON.
        // Everything else resolves itself; this does not.
        <Link href="/workflows"
              className="mt-3 block rounded-lg border border-amber-400/30 bg-amber-500/10 p-2.5 text-sm text-amber-100 hover:bg-amber-500/15">
          {parked.length} run{parked.length === 1 ? "" : "s"} waiting on your approval →
        </Link>
      ) : null}

      <ul className="mt-3 space-y-1.5">
        {recent.map((run) => (
          <li key={run.id} className="flex items-baseline justify-between gap-3 text-sm">
            <Link href={`/workflows/${encodeURIComponent(run.workflow_id ?? "")}`}
                  className="truncate hover:underline">{run.workflow_id}</Link>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${RUN_BADGE[run.status ?? ""] ?? "bg-white/10"}`}>
              {(run.status ?? "unknown").replace(/_/g, " ")}
            </span>
          </li>
        ))}
        {recent.length === 0 ? (
          <li className="text-sm text-[color:var(--ck-text-tertiary)]">No runs yet.</li>
        ) : null}
      </ul>
    </section>
  );
}

export function PluginsPanel({ plugins }: { plugins: Plugin[] }) {
  return (
    <section className={CARD}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Plugins</h2>
        <Link href="/plugins" className="text-xs text-[color:var(--ck-text-tertiary)] hover:underline">
          manage →
        </Link>
      </div>
      <ul className="mt-3 space-y-2">
        {plugins.map((plugin) => (
          <li key={plugin.name} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 p-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {/* Installed and running are different states, and the gap
                    between them is the interesting one. */}
                <span className={`h-2 w-2 shrink-0 rounded-full ${plugin.running ? "bg-emerald-400" : "bg-red-400"}`} />
                <span className="font-medium">{plugin.name}</span>
                {plugin.version ? (
                  <span className="text-xs text-[color:var(--ck-text-tertiary)]">v{plugin.version}</span>
                ) : null}
              </div>
              <div className="truncate text-xs text-[color:var(--ck-text-tertiary)]">{plugin.summary}</div>
            </div>
            <span className="shrink-0 text-xs text-[color:var(--ck-text-tertiary)]">
              {plugin.running ? (plugin.port ? `:${plugin.port}` : "running")
                : plugin.installed_service ? "installed, stopped" : "not installed"}
            </span>
          </li>
        ))}
        {plugins.length === 0 ? (
          <li className="text-sm text-[color:var(--ck-text-tertiary)]">No plugins installed.</li>
        ) : null}
      </ul>
    </section>
  );
}

const DOT: Record<string, string> = { ok: "bg-emerald-400", warn: "bg-amber-400", fail: "bg-red-400" };

export function Health({ checks }: { checks: Check[] | null }) {
  if (checks === null) {
    return (
      <section className={CARD}>
        <h2 className="text-sm font-semibold">Health</h2>
        <p className="mt-2 text-sm text-[color:var(--ck-text-tertiary)]">
          Could not run <code>jigga doctor</code>.
        </p>
      </section>
    );
  }
  // Problems first: a green list you have to scroll past is how a warning gets
  // missed.
  const ranked = [...checks].sort((a, b) =>
    ({ fail: 0, warn: 1, ok: 2 }[a.status] ?? 3) - ({ fail: 0, warn: 1, ok: 2 }[b.status] ?? 3));
  const bad = ranked.filter((c) => c.status !== "ok");
  return (
    <section className={CARD}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Health</h2>
        <span className="text-xs text-[color:var(--ck-text-tertiary)]">
          {checks.length - bad.length} ok · {bad.length} to look at
        </span>
      </div>
      <ul className="mt-3 space-y-1.5">
        {(bad.length > 0 ? bad : ranked.slice(0, 4)).map((check) => (
          <li key={check.name} className="flex items-start gap-2 text-sm">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[check.status] ?? "bg-white/30"}`} />
            <span className="min-w-0">
              <span className="font-medium">{check.name}</span>
              <span className="text-[color:var(--ck-text-tertiary)]"> — {check.detail ?? "no detail"}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
