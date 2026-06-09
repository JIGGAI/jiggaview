import { runJiggaJson } from "@/lib/jigga-cli";
import WorkflowsClient from "./workflows-client";

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
  workflow?: { steps?: Array<{ id: string; agent?: string | null; action: string }> };
};

export default async function WorkflowsPage() {
  let suggestions: Suggestion[] = [];
  let error: string | null = null;
  try {
    suggestions = await runJiggaJson<Suggestion[]>(["workflow", "suggestions", "--json"]);
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
      <WorkflowsClient suggestions={suggestions} />
    </div>
  );
}
