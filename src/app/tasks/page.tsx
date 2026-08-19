import { redirect } from "next/navigation";

/** `/tasks` moved into `/events`. The `?team=` filter carries over — team pages
 * link here with it, and dropping it would silently widen the view. */
export default async function TasksRedirect({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const teamId = typeof sp.team === "string" ? sp.team : "";
  const teamParam = teamId ? "&team=" + encodeURIComponent(teamId) : "";
  redirect(`/events?tab=tasks${teamParam}`);
}
