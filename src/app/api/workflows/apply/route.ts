import { NextResponse } from "next/server";
import { runJigga } from "@/lib/jigga-cli";

/** POST {id} → `jigga workflow apply <id> --approve` — turn a suggestion into a
 * real workflow file. The core returns {status: applied|already_applied|...}. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { id?: string };
  const id = String(body.id ?? "").trim();
  if (!id || id.startsWith("-")) {
    return NextResponse.json({ error: "suggestion id required" }, { status: 400 });
  }
  const res = await runJigga(["workflow", "apply", id, "--approve"]);
  if (!res.ok) {
    return NextResponse.json(
      { error: res.stderr.trim() || res.stdout.trim() || `apply failed (exit=${res.exitCode})` },
      { status: 500 },
    );
  }
  let parsed: { status?: string; path?: string } = {};
  try {
    parsed = JSON.parse(res.stdout);
  } catch {
    // non-JSON — treat as ok
  }
  if (parsed.status === "already_applied") {
    return NextResponse.json({ error: "This suggestion was already created." }, { status: 409 });
  }
  return NextResponse.json(parsed);
}
