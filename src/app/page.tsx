import { runJiggaJson } from "@/lib/jigga-cli";

export const dynamic = "force-dynamic";

type Check = { name: string; status: "ok" | "warn" | "fail"; summary: string; hint?: string };
type Task = { id: string; state: string; assignee?: string; title: string };

async function getDoctor(): Promise<Check[] | null> {
  try {
    const report = await runJiggaJson<{ checks: Check[] }>(["doctor", "--json"]);
    return report.checks ?? [];
  } catch {
    return null;
  }
}

async function getTasks(): Promise<Task[]> {
  try {
    return await runJiggaJson<Task[]>(["task", "list", "--json"]);
  } catch {
    return [];
  }
}

const STATUS_DOT: Record<string, string> = {
  ok: "bg-emerald-400",
  warn: "bg-amber-400",
  fail: "bg-red-400",
};

export default async function DashboardPage() {
  const [checks, tasks] = await Promise.all([getDoctor(), getTasks()]);
  const pending = tasks.filter((t) => t.state === "pending").length;
  const running = tasks.filter((t) => t.state === "running" || t.state === "claimed").length;
  const completed = tasks.filter((t) => t.state === "completed").length;

  return (
    <div className="w-full">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
        Your JIGGA runtime at a glance.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          ["Pending tasks", pending],
          ["Running", running],
          ["Completed", completed],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-[color:var(--ck-border-subtle)] bg-white/5 p-4">
            <div className="text-3xl font-semibold">{value}</div>
            <div className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">{label}</div>
          </div>
        ))}
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
        Health (jigga doctor)
      </h2>
      {checks === null ? (
        <p className="mt-2 text-sm text-amber-400">
          Couldn&apos;t run <code>jigga doctor</code> — is the jigga CLI on PATH? (Set JIGGA_BIN to override.)
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-[color:var(--ck-border-subtle)] rounded-xl border border-[color:var(--ck-border-subtle)]">
          {checks.map((c) => (
            <li key={c.name} className="flex items-start gap-3 p-3">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${STATUS_DOT[c.status] ?? "bg-gray-400"}`} />
              <div>
                <div className="text-sm font-medium">{c.name}</div>
                <div className="text-sm text-[color:var(--ck-text-secondary)]">{c.summary}</div>
                {c.hint && c.status !== "ok" ? (
                  <div className="mt-0.5 text-xs text-[color:var(--ck-text-tertiary)]">{c.hint}</div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
