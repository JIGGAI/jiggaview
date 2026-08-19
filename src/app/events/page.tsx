import Link from "next/link";
import { RunsTable } from "./runs-table";
import { TasksTable } from "./tasks-table";

export const dynamic = "force-dynamic";

/** Everything the runtime did, and everything it has been asked to do.
 *
 * Runs and Tasks were two nav entries answering two halves of one question —
 * "what is happening?" Tasks is the queue (what was asked), the audit log is
 * the record (what actually happened), and reading one without the other is
 * how you end up with a task stuck in `pending` and no idea why. They live
 * together now, one click apart.
 *
 * Tab state is a query param rather than client state: a server component can
 * read it, the tables stay server-rendered with no data round-trip, and a link
 * to one tab is a link someone else can open.
 */

const TABS = [
  { id: "runs", label: "Runs", hint: "What the runtime did" },
  { id: "tasks", label: "Tasks", hint: "What it has been asked to do" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default async function EventsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const requested = typeof sp.tab === "string" ? sp.tab : "";
  const tab: TabId = requested === "tasks" ? "tasks" : "runs";
  const teamId = typeof sp.team === "string" ? sp.team : "";
  const teamParam = teamId ? "&team=" + encodeURIComponent(teamId) : "";
  const query = (id: TabId) => `/events?tab=${id}${teamParam}`;

  return (
    <div className="w-full">
      <h1 className="text-xl font-semibold">Events</h1>

      <div className="mt-4 flex gap-2" role="tablist" aria-label="Events">
        {TABS.map((entry) => {
          const active = entry.id === tab;
          return (
            <Link
              key={entry.id}
              href={query(entry.id)}
              role="tab"
              aria-selected={active}
              title={entry.hint}
              className={
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors " +
                (active
                  ? "bg-white/10 text-[color:var(--ck-text-primary)]"
                  : "text-[color:var(--ck-text-tertiary)] hover:bg-white/5")
              }
            >
              {entry.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-4">
        {tab === "runs" ? <RunsTable /> : <TasksTable teamId={teamId} />}
      </div>
    </div>
  );
}
