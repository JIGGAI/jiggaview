import Link from "next/link";
import { WorkflowEditor } from "@/components/WorkflowEditor";

export const dynamic = "force-dynamic";

export default async function WorkflowEditorPage({
  params,
}: {
  params: Promise<{ workflowId: string }>;
}) {
  const { workflowId } = await params;
  return (
    <div className="w-full">
      <Link href="/workflows"
            className="inline-flex items-center gap-1 text-sm text-[color:var(--ck-text-tertiary)] hover:text-[color:var(--ck-text-primary)]">
        <span aria-hidden>←</span> Workflows
      </Link>
      <h1 className="mt-2 text-xl font-semibold">{workflowId}</h1>
      <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
        The shape is the workflow: which node feeds which, and where an error goes. Edits are
        validated on save by the same checks the supervisor runs.
      </p>
      <WorkflowEditor workflowId={workflowId} />
    </div>
  );
}
