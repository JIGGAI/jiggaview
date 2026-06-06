import { runJiggaJson } from "@/lib/jigga-cli";

export const dynamic = "force-dynamic";

type Task = {
  id: string;
  title: string;
  state: string;
  assignee?: string | null;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, unknown>;
};

const STATE_BADGE: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-300",
  claimed: "bg-sky-500/20 text-sky-300",
  running: "bg-sky-500/20 text-sky-300",
  completed: "bg-emerald-500/20 text-emerald-300",
  failed: "bg-red-500/20 text-red-300",
  needs_approval: "bg-purple-500/20 text-purple-300",
};

type Team = { id: string; members: string[] };

export default async function TasksPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const teamId = typeof sp.team === "string" ? sp.team : "";
  let tasks: Task[] = [];
  let error: string | null = null;
  try {
    tasks = await runJiggaJson<Task[]>(["task", "list", "--json"]);
    if (teamId) {
      const teams = await runJiggaJson<Team[]>(["team", "list", "--json"]);
      const team = teams.find((t) => t.id === teamId);
      const members = new Set(team?.members ?? []);
      tasks = tasks.filter((t) => (t.assignee ? members.has(t.assignee) : false));
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  tasks.sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-semibold">Tasks</h1>
      <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
        The runtime task queue — every channel message, scheduled wake, and dispatch.
        {teamId ? ` Filtered to team: ${teamId}.` : ""} (Lane boards land with ticket lanes, JIGGA #110.)
      </p>
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      <div className="mt-6 overflow-hidden rounded-xl border border-[color:var(--ck-border-subtle)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
            <tr>
              <th className="px-3 py-2">Task</th>
              <th className="px-3 py-2">Assignee</th>
              <th className="px-3 py-2">State</th>
              <th className="px-3 py-2">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--ck-border-subtle)]">
            {tasks.map((t) => (
              <tr key={t.id}>
                <td className="px-3 py-2">
                  <div className="font-medium">{t.title}</div>
                  <div className="text-xs text-[color:var(--ck-text-tertiary)]">{t.id}</div>
                </td>
                <td className="px-3 py-2">{t.assignee ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATE_BADGE[t.state] ?? "bg-white/10"}`}>
                    {t.state}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-[color:var(--ck-text-tertiary)]">
                  {String(t.updated_at ?? "").slice(0, 16) || "—"}
                </td>
              </tr>
            ))}
            {tasks.length === 0 && !error ? (
              <tr>
                <td className="px-3 py-6 text-center text-[color:var(--ck-text-tertiary)]" colSpan={4}>
                  No tasks yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
