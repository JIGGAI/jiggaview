export default function RunsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold">Runs</h1>
      <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
        Coming in M1: run history + per-run traces, wired to <code>jigga audit --json</code> and{" "}
        <code>jigga trace</code>.
      </p>
    </div>
  );
}
