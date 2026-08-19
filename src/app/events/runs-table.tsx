import { runJiggaJson } from "@/lib/jigga-cli";
import { FilterBar, Pager, SelectFilter, SortHeader, TextFilter } from "./controls";
import { DEFAULT_PAGE_SIZE, num, one, pick, type Params } from "./query";

type AuditEvent = {
  ts?: string;
  type: string;
  status?: string;
  details?: Record<string, unknown>;
};

const STATUS_BADGE: Record<string, string> = {
  ok: "bg-emerald-500/20 text-emerald-300",
  error: "bg-red-500/20 text-red-300",
  failed: "bg-red-500/20 text-red-300",
  deny: "bg-red-500/20 text-red-300",
  ask: "bg-amber-500/20 text-amber-300",
};

const STATUSES = [["", "any"], ["ok", "ok"], ["error", "error"], ["ask", "ask"],
                  ["deny", "deny"], ["warn", "warn"]] as const;
const SINCES = [["", "all time"], ["30m", "30m"], ["24h", "24h"], ["7d", "7d"], ["30d", "30d"]] as const;
const ACTORS = [["", "anyone"], ["human", "human"], ["machine", "machine"],
                ["user", "user"], ["agent", "agent"], ["workflow", "workflow"],
                ["supervisor", "supervisor"]] as const;

/** Deep paging costs real work: the audit log spans rotated files (123MB and
 * 100k+ events on a box that has been running a while), and reaching page N
 * means asking core for N pages' worth and keeping the last one. Bounded so a
 * hand-edited `?page=9999` cannot make the dashboard read the whole history. */
const MAX_FETCH = 5000;

export async function RunsTable({ sp }: { sp: Params }) {
  const size = num(sp, "size", DEFAULT_PAGE_SIZE, 5, 250);
  const page = num(sp, "page", 0, 0, 500);
  const dir = pick(sp, "dir", ["asc", "desc"] as const, "desc");
  const sort = pick(sp, "sort", ["time", "type", "status"] as const, "time");

  // Filters go to the CLI, not to the rendered page: filtering here would only
  // search the rows already fetched, so a search for a rare event type would
  // report "no matches" while the match sat one page deeper.
  const args = ["audit", "--json"];
  const type = one(sp, "type");
  const status = one(sp, "status");
  const agent = one(sp, "agent");
  const actor = one(sp, "actor");
  const since = one(sp, "since");
  const search = one(sp, "q");
  if (search) args.push("--contains", search);
  if (type) args.push("--type", type);
  if (status) args.push("--status", status);
  if (agent) args.push("--agent", agent);
  if (actor) args.push("--actor", actor);
  if (since) args.push("--since", since);

  const wanted = Math.min(MAX_FETCH, (page + 1) * size + 1);
  args.push("-n", String(wanted));

  let fetched: AuditEvent[] = [];
  let error: string | null = null;
  try {
    fetched = await runJiggaJson<AuditEvent[]>(args);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // `audit -n` returns the most recent N in log order (oldest first).
  fetched.reverse();
  if (sort !== "time") {
    fetched.sort((a, b) => String(a[sort] ?? "").localeCompare(String(b[sort] ?? "")));
  }
  if (dir === "asc") fetched.reverse();

  const start = page * size;
  const events = fetched.slice(start, start + size);
  const hasNext = fetched.length > start + size;
  const truncated = wanted >= MAX_FETCH;

  return (
    <div className="w-full">
      <p className="text-sm text-[color:var(--ck-text-secondary)]">
        The audit log — every wake, tool call, delivery, and policy decision.
        Trace one operation: <code>jigga trace &lt;task_id&gt;</code>.
      </p>
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      <div className="mt-4">
        <FilterBar tab="runs" sp={sp}>
          <TextFilter name="q" label="search" value={search}
                      placeholder="error text, path, id…" />
          <TextFilter name="type" label="type" value={type} placeholder="agent.tool_call" />
          <SelectFilter name="status" label="status" value={status} options={STATUSES} />
          <TextFilter name="agent" label="agent" value={agent} placeholder="chief" />
          <SelectFilter name="actor" label="actor" value={actor} options={ACTORS} />
          <SelectFilter name="since" label="since" value={since} options={SINCES} />
        </FilterBar>
      </div>
      {truncated ? (
        // Never silently: a page that quietly stopped looking would read as
        // "that is all there is".
        <p className="mt-2 text-xs text-amber-300">
          Only the most recent {MAX_FETCH.toLocaleString()} matching events are paged through.
          Narrow with a filter or a time window to reach older ones.
        </p>
      ) : null}
      <div className="mt-6 overflow-hidden rounded-xl border border-[color:var(--ck-border-subtle)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
            <tr>
              <SortHeader sp={sp} column="time" label="Time" active={sort === "time"} dir={dir} />
              <SortHeader sp={sp} column="type" label="Event" active={sort === "type"} dir={dir} />
              <SortHeader sp={sp} column="status" label="Status" active={sort === "status"} dir={dir} />
              <th className="px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--ck-border-subtle)]">
            {events.map((event, index) => {
              const details = event.details ?? {};
              // Error/reason first so failures (e.g. channel.ingest_error)
              // aren't blank, then the common identifying keys.
              const keys = [
                "error", "reason", "detail", "agent", "task_id", "team", "member",
                "to", "from", "channel", "lane", "to_lane", "recipe", "name", "key", "title",
              ];
              const summary = keys
                .filter((k) => details[k] !== undefined && details[k] !== null && details[k] !== "")
                .map((k) => `${k}=${String(details[k])}`)
                .join("  ");
              const isError = event.status === "error" || event.status === "failed";
              return (
                <tr key={index} className={isError ? "bg-red-500/5" : undefined}>
                  <td className="whitespace-nowrap px-3 py-1.5 text-xs text-[color:var(--ck-text-tertiary)]">
                    {String(event.ts ?? "").replace("T", " ").slice(0, 19) || "—"}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs">{event.type}</td>
                  <td className="px-3 py-1.5">
                    {event.status ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[event.status] ?? "bg-white/10"}`}>
                        {event.status}
                      </span>
                    ) : null}
                  </td>
                  <td
                    className={`max-w-md truncate px-3 py-1.5 text-xs ${isError ? "text-red-200" : "text-[color:var(--ck-text-secondary)]"}`}
                    title={summary || JSON.stringify(details)}
                  >
                    {summary || "—"}
                  </td>
                </tr>
              );
            })}
            {events.length === 0 && !error ? (
              <tr>
                <td className="px-3 py-6 text-center text-[color:var(--ck-text-tertiary)]" colSpan={4}>
                  {search || type || status || agent || actor || since
                    ? "No events match these filters."
                    : "No events yet."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <Pager sp={sp} page={page} size={size} shown={events.length} hasNext={hasNext} />
    </div>
  );
}
