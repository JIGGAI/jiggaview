import { runJiggaJson } from "@/lib/jigga-cli";

/** Everything the dashboard reads, in one place.
 *
 * Each source is optional: a dashboard that 500s because one CLI call failed is
 * worse than one that shows five panels and a gap. Failures are returned as
 * `null` so a panel can say "couldn't read this" instead of the page vanishing.
 */

export type Team = {
  id: string; name: string; lead?: string | null; members?: string[]; purpose?: string | null;
};
export type Agent = {
  id: string; name: string; role?: string; team?: string | null; model?: string | null;
  schedules?: number; tools?: string[]; disabled?: boolean; default?: boolean;
};
export type Plugin = {
  name: string; version?: string; summary?: string; port?: number | null;
  running?: boolean; installed_service?: boolean;
};
export type Workflow = { id: string; name?: string; status?: string };
export type WorkflowRun = {
  id: string; workflow_id?: string; status?: string; created_at?: string;
  nodes?: Record<string, { status?: string; approval_code?: string }>;
};
export type Task = {
  id: string; title: string; state: string; assignee?: string | null;
  updated_at?: string; created_at?: string; workflow_id?: string | null; lane?: string | null;
  metadata?: { team_id?: string } & Record<string, unknown>;
};
export type Lane = { id: string; description?: string | null; gate?: string | null };
/** `jigga doctor --json` names this field `detail`; `summary` is the report's
 * one-line total, not a per-check field. Reading the wrong one renders a list of
 * check names with nothing after them — which is how it looked before. */
export type Check = { name: string; status: "ok" | "warn" | "fail"; detail?: string };

async function maybe<T>(args: string[], fallback: T): Promise<T> {
  try {
    return await runJiggaJson<T>(args);
  } catch {
    return fallback;
  }
}

export async function loadOverview() {
  // In parallel: the page is already a couple of seconds of file reads, and
  // these do not depend on each other.
  const [teams, agents, plugins, workflows, runs, tasks, doctor] = await Promise.all([
    maybe<Team[]>(["team", "list", "--json"], []),
    maybe<Agent[]>(["agents", "list", "--json"], []),
    maybe<Plugin[]>(["plugins", "list", "--json"], []),
    maybe<Workflow[]>(["workflow", "list", "--json"], []),
    maybe<WorkflowRun[]>(["workflow", "runs", "--json"], []),
    maybe<Task[]>(["task", "list", "--json"], []),
    maybe<{ checks: Check[] } | null>(["doctor", "--json"], null),
  ]);
  return { teams, agents, plugins, workflows, runs, tasks, checks: doctor?.checks ?? null };
}

export async function loadTeam(teamId: string) {
  const [lanes, tasks] = await Promise.all([
    maybe<Lane[]>(["team", "lanes", teamId, "--json"], []),
    maybe<Task[]>(["task", "list", "--json"], []),
  ]);
  return { lanes, tickets: tasks.filter((t) => t.metadata?.team_id === teamId) };
}

/** Agents working right now, and on what.
 *
 * "Running" is a claimed or running TASK, not a process: JIGGA agents are woken
 * by the supervisor, do a turn, and stop. The honest question is which agent
 * currently holds work, which is exactly what the task queue says.
 */
export function working(tasks: Task[]) {
  return tasks
    .filter((t) => t.state === "running" || t.state === "claimed")
    .sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
}

/** What each agent did last, for when nothing is running — which is most of the
 * time on a healthy install, and "nothing is running" alone tells you nothing
 * about whether anything ever does. */
export function lastSeen(tasks: Task[]): Map<string, Task> {
  const latest = new Map<string, Task>();
  for (const task of tasks) {
    if (!task.assignee) continue;
    const current = latest.get(task.assignee);
    if (!current || String(task.updated_at ?? "") > String(current.updated_at ?? "")) {
      latest.set(task.assignee, task);
    }
  }
  return latest;
}
