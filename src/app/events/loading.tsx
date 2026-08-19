/** Shown while the server component reads the log and task files.
 *
 * A note saying "this can take a couple of seconds" is only half an answer:
 * without a loading state the browser sits on the PREVIOUS page while it waits,
 * so a filter you just submitted looks like it did nothing. This makes the wait
 * visible and keeps the shape of the page, so nothing jumps when it arrives.
 */
export default function EventsLoading() {
  return (
    <div className="w-full">
      <h1 className="text-xl font-semibold">Events</h1>
      <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
        Reading the log and task files…
      </p>
      <div className="mt-4 h-14 animate-pulse rounded-xl border border-[color:var(--ck-border-subtle)] bg-white/5" />
      <div className="mt-4 overflow-hidden rounded-xl border border-[color:var(--ck-border-subtle)]">
        {Array.from({ length: 8 }, (_, row) => (
          <div key={row} className="h-8 animate-pulse border-b border-[color:var(--ck-border-subtle)] bg-white/[0.03]" />
        ))}
      </div>
    </div>
  );
}
