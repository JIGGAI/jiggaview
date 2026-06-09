import { runJiggaJson } from "@/lib/jigga-cli";

export const dynamic = "force-dynamic";

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

export default async function RunsPage() {
  let events: AuditEvent[] = [];
  let error: string | null = null;
  try {
    events = await runJiggaJson<AuditEvent[]>(["audit", "-n", "100", "--json"]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  events.reverse(); // newest first

  return (
    <div className="w-full">
      <h1 className="text-xl font-semibold">Runs</h1>
      <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
        The audit log — every wake, tool call, delivery, and policy decision.
        Trace one operation: <code>jigga trace &lt;task_id&gt;</code>.
      </p>
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      <div className="mt-6 overflow-hidden rounded-xl border border-[color:var(--ck-border-subtle)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Status</th>
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
                  No events yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
