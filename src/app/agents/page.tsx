export default function AgentsPage() {
  return (
    <div className="w-full">
      <h1 className="text-xl font-semibold">Agents</h1>
      <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
        Coming in M1: agent list + identity files (SOUL/AGENTS/MEMORY), wired to a new{" "}
        <code>jigga agents list --json</code> CLI surface (CLI-as-API — this page lands together
        with that core PR).
      </p>
    </div>
  );
}
