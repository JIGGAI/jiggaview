"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetch-json";
import type { Suggestion } from "./page";

function createLabel(applied: boolean | undefined, busy: boolean): string {
  if (applied) return "Created";
  return busy ? "Creating…" : "Create workflow";
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-[color:var(--ck-text-tertiary)]">{pct}% confidence</span>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  busy,
  onCreate,
}: {
  suggestion: Suggestion;
  busy: boolean;
  onCreate: (s: Suggestion) => void;
}) {
  const steps = suggestion.workflow?.steps ?? [];
  return (
    <li className="flex flex-col rounded-xl border border-[color:var(--ck-border-subtle)] bg-white/5 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium">{suggestion.name}</div>
          <div className="text-xs text-[color:var(--ck-text-tertiary)]">
            {suggestion.evidence_count} occurrence{suggestion.evidence_count === 1 ? "" : "s"} ·{" "}
            {suggestion.step_count} step{suggestion.step_count === 1 ? "" : "s"}
          </div>
        </div>
        {suggestion.applied ? (
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">created</span>
        ) : null}
      </div>
      <div className="mt-2">
        <ConfidenceBar value={suggestion.confidence} />
      </div>
      {steps.length ? (
        <ol className="mt-3 space-y-1 text-xs text-[color:var(--ck-text-secondary)]">
          {steps.map((step, i) => (
            <li key={step.id}>
              <span className="text-[color:var(--ck-text-tertiary)]">{i + 1}.</span>{" "}
              {step.agent ? <span className="font-mono">{step.agent}</span> : "supervisor"} — {step.action}
            </li>
          ))}
        </ol>
      ) : null}
      {suggestion.hint ? (
        <p className="mt-2 text-xs text-amber-300">{suggestion.hint}</p>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-2 pt-3">
        <button
          className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-1.5 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] hover:bg-[var(--ck-accent-red-hover)] disabled:opacity-50"
          disabled={busy || suggestion.applied}
          onClick={() => onCreate(suggestion)}
          title="Create a draft workflow from this suggestion (you can edit it after)"
        >
          {createLabel(suggestion.applied, busy)}
        </button>
      </div>
    </li>
  );
}

export default function WorkflowsClient({ suggestions }: { suggestions: Suggestion[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function create(suggestion: Suggestion) {
    setBusy(suggestion.id);
    setMessage(null);
    try {
      const res = await fetchJson<{ path?: string }>("/api/workflows/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: suggestion.id }),
      });
      const where = res.path ? ` → ${res.path}` : "";
      setMessage(`Created ${suggestion.name}${where}. It's a draft — edit its steps before relying on it.`);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6">
      {message ? <p className="mb-3 text-sm text-[color:var(--ck-text-secondary)]">{message}</p> : null}
      {suggestions.length ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {suggestions.map((s) => (
            <SuggestionCard key={s.id} suggestion={s} busy={busy === s.id} onCreate={(x) => void create(x)} />
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-[color:var(--ck-border-subtle)] bg-white/5 px-4 py-3 text-sm text-[color:var(--ck-text-secondary)]">
          No suggestions yet. JIGGA proposes a workflow once it sees the same multi-step pattern repeat in the audit log.
        </div>
      )}
    </div>
  );
}
