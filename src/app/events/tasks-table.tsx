import { runJiggaJson } from "@/lib/jigga-cli";
import { FilterBar, Pager, SelectFilter, SortHeader, TextFilter } from "./controls";
import { DEFAULT_PAGE_SIZE, num, one, pick, type Params } from "./query";

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

const STATES = [["", "any"], ["pending", "pending"], ["claimed", "claimed"], ["running", "running"],
                ["completed", "completed"], ["failed", "failed"],
                ["needs_approval", "needs_approval"]] as const;

const SORTABLE = ["updated_at", "created_at", "title", "state", "assignee"] as const;

export async function TasksTable({ sp, teamId = "" }: { sp: Params; teamId?: string }) {
  const size = num(sp, "size", DEFAULT_PAGE_SIZE, 5, 250);
  const page = num(sp, "page", 0, 0, 500);
  const dir = pick(sp, "dir", ["asc", "desc"] as const, "desc");
  const sort = pick(sp, "sort", SORTABLE, "updated_at");
  const state = one(sp, "state");
  const assignee = one(sp, "assignee");
  const query = one(sp, "q").toLowerCase();
  const lane = one(sp, "lane");

  let tasks: Task[] = [];
  let error: string | null = null;
  try {
    // `--lane` is the only filter core offers here; the rest are applied below
    // over the whole list, which is small (unlike the audit log, tasks live in
    // one directory and do not rotate).
    const args = ["task", "list", "--json"];
    if (lane) args.push("--lane", lane);
    tasks = await runJiggaJson<Task[]>(args);
    if (teamId) {
      const teams = await runJiggaJson<Team[]>(["team", "list", "--json"]);
      const team = teams.find((t) => t.id === teamId);
      const members = new Set(team?.members ?? []);
      tasks = tasks.filter((t) => (t.assignee ? members.has(t.assignee) : false));
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (state) tasks = tasks.filter((t) => t.state === state);
  if (assignee) tasks = tasks.filter((t) => (t.assignee ?? "").includes(assignee));
  if (query) {
    tasks = tasks.filter((t) =>
      t.title.toLowerCase().includes(query) || t.id.toLowerCase().includes(query));
  }

  tasks.sort((a, b) => {
    const left = String(a[sort] ?? "");
    const right = String(b[sort] ?? "");
    // Blank last in both directions: a task with no assignee is missing data,
    // not the alphabetically-first assignee.
    if (left === "" && right !== "") return 1;
    if (right === "" && left !== "") return -1;
    return dir === "desc" ? right.localeCompare(left) : left.localeCompare(right);
  });

  const total = tasks.length;
  const start = page * size;
  const shown = tasks.slice(start, start + size);

  return (
    <div className="w-full">
      <p className="text-sm text-[color:var(--ck-text-secondary)]">
        The runtime task queue — every channel message, scheduled wake, and dispatch.
        {teamId ? ` Filtered to team: ${teamId}.` : ""} (Lane boards land with ticket lanes, JIGGA #110.)
      </p>
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      <div className="mt-4">
        <FilterBar tab="tasks" sp={sp}>
          <TextFilter name="q" label="search" value={one(sp, "q")} placeholder="title or id" />
          <SelectFilter name="state" label="state" value={state} options={STATES} />
          <TextFilter name="assignee" label="assignee" value={assignee} placeholder="chief" />
          <TextFilter name="lane" label="lane" value={lane} placeholder="backlog" />
        </FilterBar>
      </div>
      <div className="mt-6 overflow-hidden rounded-xl border border-[color:var(--ck-border-subtle)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
            <tr>
              <SortHeader sp={sp} column="title" label="Task" active={sort === "title"} dir={dir} />
              <SortHeader sp={sp} column="assignee" label="Assignee" active={sort === "assignee"} dir={dir} />
              <SortHeader sp={sp} column="state" label="State" active={sort === "state"} dir={dir} />
              <SortHeader sp={sp} column="updated_at" label="Updated" active={sort === "updated_at"} dir={dir} />
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--ck-border-subtle)]">
            {shown.map((t) => (
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
            {shown.length === 0 && !error ? (
              <tr>
                <td className="px-3 py-6 text-center text-[color:var(--ck-text-tertiary)]" colSpan={4}>
                  {state || assignee || query || lane
                    ? "No tasks match these filters."
                    : "No tasks yet."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <Pager sp={sp} page={page} size={size} shown={shown.length}
             hasNext={start + size < total} total={total} />
    </div>
  );
}
