"use client";

import { parse as parseYaml } from "yaml";

// --- JIGGA recipe frontmatter (a tolerant subset — users edit live YAML) -----

type CronJob = {
  id?: string;
  schedule?: string;
  event?: string;
  message?: string;
  enabledByDefault?: boolean;
  agentId?: string;
  channel?: string;
};

type WakeSchedule = { cron?: string; event?: string; message?: string };

type AgentSpec = {
  name?: string;
  role?: string;
  description?: string;
  model?: string;
  memory_scope?: string;
  tools?: string[];
  wake?: { schedules?: WakeSchedule[]; events?: string[]; accepts_agent_requests?: boolean };
  cronJobs?: CronJob[];
  permissions?: Record<string, unknown>;
  workflows?: string[];
  notifications?: { channel?: string };
};

type TeamAgentEntry = { role?: string; id?: string; required?: boolean; agent?: AgentSpec };

type WorkflowSpec = {
  id?: string;
  name?: string;
  purpose?: string;
  status?: string;
  trigger?: { schedule?: string; event?: string; offsets?: string[] };
  steps?: unknown[];
};

export type RecipeFrontmatter = {
  id?: string;
  name?: string;
  kind?: string;
  version?: string;
  description?: string;
  purpose?: string;
  memory_scope?: string;
  routing?: { lead?: string };
  default_workflows?: string[];
  agents?: TeamAgentEntry[];
  agent?: AgentSpec;
  workflows?: WorkflowSpec[];
};

export function parseRecipeFrontmatter(raw: string): { fm: RecipeFrontmatter | null; error?: string } {
  if (!raw.startsWith("---")) return { fm: null };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { fm: null };
  const yamlText = raw.slice(raw.indexOf("\n") + 1, end);
  try {
    const fm = parseYaml(yamlText) as RecipeFrontmatter;
    if (!fm || typeof fm !== "object") return { fm: null };
    return { fm };
  } catch (e) {
    return { fm: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// --- presentational bits -----------------------------------------------------

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div>
      <span className="text-[color:var(--ck-text-tertiary)]">{label}:</span> {value}
    </div>
  );
}

function Section({ title, count, children, open }: { title: string; count?: number; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="rounded-lg border border-white/10 bg-white/5 p-3" open={open}>
      <summary className="cursor-pointer text-sm font-medium text-[color:var(--ck-text-primary)]">
        {title}
        {count !== undefined ? ` (${count})` : null}
      </summary>
      <div className="mt-2 space-y-2 text-xs text-[color:var(--ck-text-secondary)]">{children}</div>
    </details>
  );
}

function tools(spec: AgentSpec | undefined): string {
  const t = spec?.tools;
  return Array.isArray(t) && t.length ? t.join(", ") : "(none)";
}

function permKeys(spec: AgentSpec | undefined): string {
  const p = spec?.permissions;
  return p && typeof p === "object" ? Object.keys(p).join(", ") || "(none)" : "(none)";
}

function AgentDetails({ entry }: { entry: TeamAgentEntry }) {
  const a = entry.agent;
  const schedules = a?.wake?.schedules ?? [];
  return (
    <details className="rounded-lg border border-white/10 bg-white/5 p-3">
      <summary className="cursor-pointer text-sm text-[color:var(--ck-text-primary)]">
        <span className="font-medium">{a?.name ?? entry.id ?? entry.role ?? "(unnamed)"}</span>
        {entry.role ? <span className="text-[color:var(--ck-text-tertiary)]"> — {entry.role}</span> : null}
        {entry.required === false ? <span className="text-[color:var(--ck-text-tertiary)]"> · membership-only</span> : null}
      </summary>
      <div className="mt-2 space-y-1">
        <Row label="Id" value={entry.id} />
        <Row label="Role" value={a?.role} />
        <Row label="Model" value={a?.model} />
        <Row label="Memory scope" value={a?.memory_scope} />
        <Row label="Tools" value={tools(a)} />
        <Row label="Permissions" value={permKeys(a)} />
        <Row label="Notifications" value={a?.notifications?.channel} />
        {schedules.length ? (
          <div className="pt-1">
            <span className="text-[color:var(--ck-text-tertiary)]">Schedules:</span>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {schedules.map((s, i) => (
                <li key={`${s.cron ?? s.event ?? "sched"}:${i}`}>
                  <span className="font-mono">{s.cron ?? s.event ?? "(trigger)"}</span>
                  {s.event && s.cron ? <span className="text-[color:var(--ck-text-tertiary)]"> → {s.event}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function teamSchedules(fm: RecipeFrontmatter): Array<{ key: string; who: string; when: string; message?: string }> {
  const out: Array<{ key: string; who: string; when: string; message?: string }> = [];
  for (const entry of fm.agents ?? []) {
    for (const [i, s] of (entry.agent?.wake?.schedules ?? []).entries()) {
      if (!s.cron && !s.event) continue;
      out.push({
        key: `${entry.id ?? entry.role}:${i}`,
        who: entry.id ?? entry.role ?? "agent",
        when: s.cron ?? s.event ?? "",
        message: s.message,
      });
    }
  }
  for (const [i, w] of (fm.workflows ?? []).entries()) {
    const when = w.trigger?.schedule ?? w.trigger?.event;
    if (!when) continue;
    out.push({ key: `wf:${w.id ?? i}`, who: w.name ?? w.id ?? "workflow", when });
  }
  return out;
}

export function RecipeInfoPanel({ fm, error }: { fm: RecipeFrontmatter | null; error?: string }) {
  if (error) {
    return (
      <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200">
        Frontmatter not parseable yet: {error}
      </div>
    );
  }
  if (!fm) {
    return <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-[color:var(--ck-text-tertiary)]">No frontmatter detected.</div>;
  }

  const isTeam = (fm.kind ?? (fm.agents ? "team" : "agent")) === "team";
  const agentEntries = fm.agents ?? [];
  const schedules = isTeam ? teamSchedules(fm) : (fm.agent?.cronJobs ?? []).map((c, i) => ({
    key: c.id ?? `cron:${i}`,
    who: c.agentId ?? fm.id ?? "agent",
    when: c.schedule ?? c.event ?? "",
    message: c.message,
  }));

  return (
    <div className="space-y-3">
      <Section title="Recipe information" open>
        <Row label="Id" value={fm.id} />
        <Row label="Name" value={fm.name} />
        <Row label="Kind" value={fm.kind} />
        <Row label="Version" value={fm.version} />
        <Row label="Memory scope" value={fm.memory_scope} />
        <Row label="Lead role" value={fm.routing?.lead} />
        {fm.description ?? fm.purpose ? (
          <div className="whitespace-pre-wrap pt-1">{fm.description ?? fm.purpose}</div>
        ) : null}
      </Section>

      {isTeam ? (
        <Section title="Agents" count={agentEntries.length} open>
          {agentEntries.length ? (
            agentEntries.map((entry, i) => <AgentDetails key={entry.id ?? entry.role ?? i} entry={entry} />)
          ) : (
            <div className="text-[color:var(--ck-text-tertiary)]">(No agents in frontmatter)</div>
          )}
        </Section>
      ) : (
        <Section title="Agent" open>
          <Row label="Role" value={fm.agent?.role} />
          <Row label="Model" value={fm.agent?.model} />
          <Row label="Tools" value={tools(fm.agent)} />
          <Row label="Permissions" value={permKeys(fm.agent)} />
        </Section>
      )}

      <Section title="Cron / schedules" count={schedules.length}>
        {schedules.length ? (
          schedules.map((s) => (
            <div key={s.key} className="rounded-lg border border-white/10 bg-white/5 p-2">
              <div>
                <span className="font-mono">{s.when || "(trigger)"}</span>
                <span className="text-[color:var(--ck-text-tertiary)]"> — {s.who}</span>
              </div>
              {s.message ? <div className="mt-1 whitespace-pre-wrap text-[11px]">{s.message}</div> : null}
            </div>
          ))
        ) : (
          <div className="text-[color:var(--ck-text-tertiary)]">(No schedules in frontmatter)</div>
        )}
      </Section>

      {isTeam && (fm.workflows?.length ?? 0) > 0 ? (
        <Section title="Workflows" count={fm.workflows?.length ?? 0}>
          {(fm.workflows ?? []).map((w, i) => (
            <details key={w.id ?? i} className="rounded-lg border border-white/10 bg-white/5 p-2">
              <summary className="cursor-pointer text-[color:var(--ck-text-primary)]">
                <span className="font-medium">{w.name ?? w.id}</span>
                {w.trigger?.schedule || w.trigger?.event ? (
                  <span className="text-[color:var(--ck-text-tertiary)]"> — {w.trigger?.schedule ?? w.trigger?.event}</span>
                ) : null}
              </summary>
              <div className="mt-1 space-y-1">
                <Row label="Status" value={w.status} />
                <Row label="Steps" value={Array.isArray(w.steps) ? w.steps.length : undefined} />
                <Row label="Offsets" value={w.trigger?.offsets?.join(", ")} />
                {w.purpose ? <div className="whitespace-pre-wrap">{w.purpose}</div> : null}
              </div>
            </details>
          ))}
        </Section>
      ) : null}
    </div>
  );
}

// --- change diff (what the user has edited vs the saved original) ------------

type DiffLine = { type: "add" | "del" | "ctx"; text: string };

/** Minimal LCS line diff — recipes are small, so the O(n·m) table is fine. */
function diffLines(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "ctx", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", text: a[i++] });
    } else {
      out.push({ type: "add", text: b[j++] });
    }
  }
  while (i < n) out.push({ type: "del", text: a[i++] });
  while (j < m) out.push({ type: "add", text: b[j++] });
  return out;
}

/** Drop unchanged runs longer than `ctx` lines down to an ellipsis, so the
 * panel shows just what changed (with a little surrounding context). */
function condense(lines: DiffLine[], ctx = 2): Array<DiffLine | { type: "gap" }> {
  const changed = lines.map((l) => l.type !== "ctx");
  const keep = lines.map((_, idx) =>
    changed.slice(Math.max(0, idx - ctx), idx + ctx + 1).some(Boolean),
  );
  const out: Array<DiffLine | { type: "gap" }> = [];
  let gapped = false;
  lines.forEach((line, idx) => {
    if (keep[idx]) {
      out.push(line);
      gapped = false;
    } else if (!gapped) {
      out.push({ type: "gap" });
      gapped = true;
    }
  });
  return out;
}

function diffRowClass(type: DiffLine["type"]): string {
  if (type === "add") return "bg-emerald-500/10 text-emerald-200";
  if (type === "del") return "bg-red-500/10 text-red-200";
  return "text-[color:var(--ck-text-secondary)]";
}

function diffSign(type: DiffLine["type"]): string {
  if (type === "add") return "+";
  if (type === "del") return "−";
  return " ";
}

export function RecipeChangeDiff({ original, draft }: { original: string; draft: string }) {
  if (original === draft) {
    return <p className="text-xs text-[color:var(--ck-text-tertiary)]">No changes from the saved recipe.</p>;
  }
  const lines = diffLines(original.split("\n"), draft.split("\n"));
  const added = lines.filter((l) => l.type === "add").length;
  const removed = lines.filter((l) => l.type === "del").length;
  const rows = condense(lines);
  return (
    <div>
      <div className="mb-2 text-xs">
        <span className="text-emerald-300">+{added}</span>{" "}
        <span className="text-red-300">−{removed}</span>{" "}
        <span className="text-[color:var(--ck-text-tertiary)]">vs. saved recipe</span>
      </div>
      <pre className="max-h-[28vh] overflow-auto rounded-lg border border-white/10 bg-black/30 p-2 font-mono text-[11px] leading-relaxed">
        {rows.map((row, idx) => {
          if (row.type === "gap") {
            return <div key={`gap:${idx}`} className="text-[color:var(--ck-text-tertiary)]">⋯</div>;
          }
          return (
            <div key={`row:${idx}`} className={diffRowClass(row.type)}>
              {diffSign(row.type)} {row.text || " "}
            </div>
          );
        })}
      </pre>
    </div>
  );
}
