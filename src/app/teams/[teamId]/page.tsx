import Link from "next/link";
import { runJiggaJson } from "@/lib/jigga-cli";
import TeamEditor from "./team-editor";

export const dynamic = "force-dynamic";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  let team: Record<string, unknown> | null = null;
  let error: string | null = null;
  try {
    team = await runJiggaJson<Record<string, unknown>>(["team", "get", teamId, "--json"]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Team: {teamId}</h1>
        <Link
          href={`/agents?team=${encodeURIComponent(teamId)}`}
          className="rounded-lg bg-white/10 px-3 py-1 text-xs font-medium hover:bg-white/15"
        >
          View agents
        </Link>
      </div>
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      {team ? <TeamEditor teamId={teamId} team={team} /> : null}
    </div>
  );
}
