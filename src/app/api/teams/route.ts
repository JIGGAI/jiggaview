import { NextResponse } from "next/server";
import { runJiggaJson } from "@/lib/jigga-cli";

export type Team = {
  id: string;
  name: string;
  purpose?: string | null;
  lead?: string | null;
  members: string[];
};

export async function GET() {
  try {
    const teams = await runJiggaJson<Team[]>(["team", "list", "--json"]);
    return NextResponse.json({ teams });
  } catch (e) {
    return NextResponse.json(
      { teams: [], error: e instanceof Error ? e.message : String(e) },
      { status: 200 }, // soft-fail: the switcher just shows "All teams"
    );
  }
}
