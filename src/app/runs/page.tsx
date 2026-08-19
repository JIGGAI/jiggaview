import { redirect } from "next/navigation";

/** `/runs` moved into `/events`. Kept as a redirect rather than deleted: it was
 * a nav entry for months, so it is in people's history and bookmarks. */
export default function RunsRedirect() {
  redirect("/events?tab=runs");
}
