import Link from "next/link";
import { href, PAGE_SIZES, type Params } from "./query";

/** The filter/sort/paging furniture both tabs share. */

const CONTROL =
  "rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]";
const BUTTON =
  "rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium " +
  "text-[color:var(--ck-text-primary)] hover:bg-white/10";

export function TextFilter({ name, label, value, placeholder }: {
  name: string; label: string; value: string; placeholder?: string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-[color:var(--ck-text-tertiary)]">
      {label}
      <input className={CONTROL} name={name} defaultValue={value} placeholder={placeholder} />
    </label>
  );
}

export function SelectFilter({ name, label, value, options }: {
  name: string; label: string; value: string; options: readonly (readonly [string, string])[];
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-[color:var(--ck-text-tertiary)]">
      {label}
      <select className={CONTROL} name={name} defaultValue={value}>
        {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
      </select>
    </label>
  );
}

/** A plain GET form: no client JS, and the resulting URL is the state.
 *
 * `tab` rides along as a hidden field — submitting a filter from the Tasks tab
 * must not drop you back on Runs.
 */
export function FilterBar({ tab, children, sp }: {
  tab: string; children: React.ReactNode; sp: Params;
}) {
  const filtered = Object.entries(sp).some(
    ([key, value]) => !["tab", "sort", "dir", "page", "size"].includes(key) && value);
  return (
    <form method="get" action="/events" className="flex flex-wrap items-end gap-3 rounded-xl
                                                   border border-[color:var(--ck-border-subtle)] p-3">
      <input type="hidden" name="tab" value={tab} />
      {/* Sort and page size survive a filter change; the page number does not,
          because page 4 of a result set you just replaced looks like no matches. */}
      {["sort", "dir", "size"].map((key) =>
        typeof sp[key] === "string" && sp[key]
          ? <input key={key} type="hidden" name={key} value={sp[key] as string} />
          : null)}
      {children}
      <button type="submit" className={BUTTON}>Apply</button>
      {filtered ? (
        <Link href={`/events?tab=${tab}`} className="text-xs text-[color:var(--ck-text-tertiary)] hover:underline">
          Clear
        </Link>
      ) : null}
    </form>
  );
}

/** A column header that sorts. Clicking the active column flips direction. */
export function SortHeader({ sp, column, label, active, dir, className }: {
  sp: Params; column: string; label: string; active: boolean; dir: "asc" | "desc"; className?: string;
}) {
  const next = active && dir === "desc" ? "asc" : "desc";
  return (
    <th className={`px-3 py-2 ${className ?? ""}`}>
      <Link href={href(sp, { sort: column, dir: next })}
            className="inline-flex items-center gap-1 hover:text-[color:var(--ck-text-primary)]">
        {label}
        <span aria-hidden className={active ? "" : "opacity-0"}>{dir === "desc" ? "↓" : "↑"}</span>
        {active ? <span className="sr-only">{dir === "desc" ? "descending" : "ascending"}</span> : null}
      </Link>
    </th>
  );
}

/**
 * Prev/next paging.
 *
 * `total` is optional because it is not always knowable: the task list is read
 * whole, but the audit log spans rotated files and counting it would mean
 * reading 100k+ events to render one page. Where the total is unknown the pager
 * says which page you are on and whether another exists — which is what the
 * buttons need — rather than inventing a denominator.
 */
export function Pager({ sp, page, size, shown, hasNext, total }: {
  sp: Params; page: number; size: number; shown: number; hasNext: boolean; total?: number;
}) {
  const first = shown === 0 ? 0 : page * size + 1;
  const last = page * size + shown;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[color:var(--ck-text-tertiary)]">
      <span>
        {shown === 0 ? "Nothing to show" : `${first}–${last}`}
        {total !== undefined ? ` of ${total}` : null}
      </span>
      <div className="flex items-center gap-2">
        {page > 0 ? (
          <Link className={BUTTON} href={href(sp, { page: page - 1 })}>← Prev</Link>
        ) : <span className={`${BUTTON} opacity-40`}>← Prev</span>}
        <span>page {page + 1}</span>
        {hasNext ? (
          <Link className={BUTTON} href={href(sp, { page: page + 1 })}>Next →</Link>
        ) : <span className={`${BUTTON} opacity-40`}>Next →</span>}
      </div>
      <label className="flex items-center gap-1.5">
        per page
        <span className="flex gap-1">
          {PAGE_SIZES.map((option) => (
            <Link key={option} href={href(sp, { size: option, page: null })}
                  className={option === size
                    ? "rounded px-1.5 py-0.5 bg-white/10 text-[color:var(--ck-text-primary)]"
                    : "rounded px-1.5 py-0.5 hover:bg-white/5"}>
              {option}
            </Link>
          ))}
        </span>
      </label>
    </div>
  );
}
