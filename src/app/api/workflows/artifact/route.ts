import { NextResponse } from "next/server";
import { runJigga, runJiggaWithInput } from "@/lib/jigga-cli";

/** One file a workflow run produced: read it, write it back.
 *
 * A step's `output:` name is a real file in the run directory — the closest
 * thing JIGGA has to a deliverable. Reading it here is what makes a node on the
 * diagram clickable; writing it is what makes `human_approval` a whole review
 * rather than half of one, because you can fix the two sentences that are wrong
 * instead of denying and re-running the graph to change a headline.
 *
 * Both directions are the CLI's decisions, not this route's: `workflow artifact`
 * and `workflow artifact-save` confine the name to the run directory and refuse
 * a `running` run, so the guards here only reject arguments that would be
 * misread as flags.
 */

function badArg(value: string): boolean {
  return !value || value.startsWith("-");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const runId = (url.searchParams.get("runId") ?? "").trim();
  const name = (url.searchParams.get("name") ?? "").trim();
  if (badArg(runId) || badArg(name)) {
    return NextResponse.json({ error: "invalid runId or name" }, { status: 400 });
  }
  const res = await runJigga(["workflow", "artifact", runId, name]);
  if (!res.ok) {
    // A node that has not run yet has no file, which is an ordinary state to
    // render ("not written yet"), not an error to shout about.
    const message = res.stdout.trim() || res.stderr.trim() || "not found";
    return NextResponse.json({ runId, name, content: null, exists: false, note: message });
  }
  return NextResponse.json({ runId, name, content: res.stdout, exists: true });
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as
    { runId?: string; name?: string; content?: string };
  const runId = String(body.runId ?? "").trim();
  const name = String(body.name ?? "").trim();
  if (badArg(runId) || badArg(name)) {
    return NextResponse.json({ error: "invalid runId or name" }, { status: 400 });
  }
  // On stdin, not argv: the body is a deliverable and argv is world-readable.
  const res = await runJiggaWithInput(
    ["workflow", "artifact-save", runId, name, "--json"], String(body.content ?? ""),
  );
  if (!res.ok) {
    return NextResponse.json(
      { error: res.stdout.trim() || res.stderr.trim() || "save failed" },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(JSON.parse(res.stdout));
  } catch {
    return NextResponse.json({ ok: true });
  }
}
