import { NextResponse } from "next/server";
import { runJigga, runJiggaJson } from "@/lib/jigga-cli";

/** Installed plugins and their service state.
 *
 * Plugins are global out-of-process apps supervised by JIGGA itself — jiggaview
 * is one, which is why this page can list the thing serving it. ClawKitchen
 * scopes plugins per team-type; JIGGA does not, so this belongs in the nav
 * rather than on a team page.
 *
 * `install` and `uninstall` are deliberately absent: installing runs a
 * third-party's setup commands and records an approval, which is a decision to
 * make at a terminal with the source in front of you, not a button in a
 * dashboard that a plugin could itself be serving.
 */

export type Plugin = {
  name: string;
  version?: string | null;
  summary?: string | null;
  dir?: string;
  port?: number | null;
  running?: boolean;
  installed_service?: boolean;
};

export async function GET() {
  try {
    return NextResponse.json({ plugins: await runJiggaJson<Plugin[]>(["plugins", "list", "--json"]) });
  } catch (e) {
    return NextResponse.json(
      { plugins: [], error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** POST {name, action: start|stop} — service control only. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { name?: string; action?: string };
  const name = String(body.name ?? "").trim();
  const action = String(body.action ?? "").trim();
  if (!name || name.startsWith("-") || !["start", "stop"].includes(action)) {
    return NextResponse.json({ error: "name and action (start|stop) required" }, { status: 400 });
  }
  const res = await runJigga(["plugins", action, name, "--json"]);
  if (!res.ok) {
    return NextResponse.json(
      { error: res.stderr.trim() || res.stdout.trim() || `${action} failed` },
      { status: 500 },
    );
  }
  try {
    return NextResponse.json(JSON.parse(res.stdout));
  } catch {
    return NextResponse.json({ ok: true });
  }
}
