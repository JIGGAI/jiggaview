/** Query-param plumbing shared by both Events tabs.
 *
 * Filters, sort and paging all live in the URL rather than in client state, for
 * the same reason the tab does: the tables stay server-rendered with no data
 * round-trip, the back button works, and a filtered view is a link someone else
 * can open.
 */

export type Params = Record<string, string | string[] | undefined>;

export function one(sp: Params, key: string, fallback = ""): string {
  const value = sp[key];
  return typeof value === "string" ? value : fallback;
}

/** A bounded positive integer — a page size of `1e9` in the URL is a denial of
 * service against the box, not a preference to honour. */
export function num(sp: Params, key: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(one(sp, key), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function pick<T extends string>(sp: Params, key: string, allowed: readonly T[], fallback: T): T {
  const value = one(sp, key);
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** `/events?…` with `changes` applied over the current params.
 *
 * A null value drops the key, so callers can express "clear this filter"
 * without assembling the whole string themselves. Any change to filters or
 * sorting resets the page: staying on page 4 of a result set you just replaced
 * shows an empty table and reads as "no matches".
 */
export function href(sp: Params, changes: Record<string, string | number | null>): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string" && value !== "") next.set(key, value);
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === "") next.delete(key);
    else next.set(key, String(value));
  }
  if (!("page" in changes)) next.delete("page");
  const query = next.toString();
  return query ? `/events?${query}` : "/events";
}

export const PAGE_SIZES = [25, 50, 100, 250] as const;
export const DEFAULT_PAGE_SIZE = 100;
