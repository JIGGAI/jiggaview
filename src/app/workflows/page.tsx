import { runJiggaJson } from "@/lib/jigga-cli";
import WorkflowsClient from "./workflows-client";
import RunsClient from "./runs-client";

export const dynamic = "force-dynamic";

export type Suggestion = {
  id: string;
  name: string;
  purpose?: string;
  confidence: number;
  evidence_count: number;
  step_count: number;
  modal_hour_utc?: number | null;
  hint?: string;
  applied?: boolean;
  workflow?: {
    steps?: Array<{
      id: string;
      agent?: string | null;
      action: string;
      input?: { assignee?: string; title?: string };
    }>;
  };
};

type Installed = { id: string; name?: string; status?: string | null };

export default async function WorkflowsPage() {
  let suggestions: Suggestion[] = [];
  let installed: Installed[] = [];
  let error: string | null = null;
  try {
    [suggestions, installed] = await Promise.all([
      runJiggaJson<Suggestion[]>(["workflow", "suggestions", "--json"]),
      // The page only ever showed SUGGESTIONS, so the workflows you actually
      // have appeared nowhere in the UI.
      runJiggaJson<Installed[]>(["workflow", "list", "--json"]).catch(() => []),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  // Highest-confidence, not-yet-created first.
  suggestions.sort((a, b) => Number(a.applied) - Number(b.applied) || b.confidence - a.confidence);

  return (
    <div className="w-full">
      <h1 className="text-xl font-semibold">Workflows</h1>
      <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
        Suggestions JIGGA inferred from repeated work in the audit log. Create one to turn a recurring pattern into a
        reusable workflow (a draft you can then edit).
      </p>
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
        Installed
      </h2>
      {installed.length === 0 ? (
        <p className="mt-2 text-sm text-[color:var(--ck-text-tertiary)]">
          None yet — create one from a suggestion below, or write one and{" "}
          <span className="font-mono">jigga workflow save</span> it.
        </p>
      ) : (
        <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {installed.map((workflow) => (
            <li key={workflow.id} className="ck-card flex items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{workflow.name || workflow.id}</div>
                <div className="truncate font-mono text-[10px] text-[color:var(--ck-text-tertiary)]">
                  {workflow.id}
                </div>
              </div>
              {workflow.status ? (
                <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-[color:var(--ck-text-secondary)]">
                  {workflow.status}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
        Runs
      </h2>
      <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
        Every run, drawn as the graph it is. A node waiting on you can be answered here.
      </p>
      <RunsClient />

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
        Suggestions
      </h2>
      <WorkflowsClient suggestions={suggestions} />
    </div>
  );
}
