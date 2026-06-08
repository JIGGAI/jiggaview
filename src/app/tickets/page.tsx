import { runJiggaJson } from "@/lib/jigga-cli";
import TicketsBoard from "./tickets-board";

export const dynamic = "force-dynamic";

export type Lane = { id: string; description?: string | null; gate?: string | null };

export type Ticket = {
  id: string;
  title: string;
  state: string;
  assignee?: string | null;
  lane?: string | null;
  updated_at?: string;
  metadata?: { team_id?: string } & Record<string, unknown>;
};

type Team = { id: string; name: string; lead?: string; members: string[] };

export default async function TicketsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  let teams: Team[] = [];
  let error: string | null = null;
  try {
    teams = await runJiggaJson<Team[]>(["team", "list", "--json"]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // Selected team: ?team= (shared with the rest of the app), else the first.
  const requested = typeof sp.team === "string" ? sp.team : "";
  const teamId = teams.some((t) => t.id === requested) ? requested : teams[0]?.id ?? "";

  let lanes: Lane[] = [];
  let tickets: Ticket[] = [];
  if (teamId) {
    try {
      // Lanes is best-effort: a team without a board (or older jigga) just
      // yields an empty board with a hint, not an error page.
      lanes = await runJiggaJson<Lane[]>(["team", "lanes", teamId, "--json"]).catch(() => []);
      const all = await runJiggaJson<Ticket[]>(["task", "list", "--json"]);
      tickets = all.filter((t) => t.metadata?.team_id === teamId);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div className="w-full">
      <h1 className="text-xl font-semibold">Tickets</h1>
      <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
        Each team&apos;s ticket board — columns are the team&apos;s declared lanes; cards are its tasks.
      </p>
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      <TicketsBoard
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
        teamId={teamId}
        lanes={lanes}
        tickets={tickets}
      />
    </div>
  );
}
