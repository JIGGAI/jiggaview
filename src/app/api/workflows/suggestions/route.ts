import { NextResponse } from "next/server";
import { runJiggaJson } from "@/lib/jigga-cli";

type Suggestion = { id: string; applied?: boolean };

/** GET → the open (not-yet-created) workflow-suggestion count, for the nav
 * badge. Best-effort: any failure returns 0 so the badge never breaks the app. */
export async function GET() {
  try {
    const suggestions = await runJiggaJson<Suggestion[]>(["workflow", "suggestions", "--json"]);
    const open = suggestions.filter((s) => !s.applied).length;
    return NextResponse.json({ open });
  } catch {
    return NextResponse.json({ open: 0 });
  }
}
