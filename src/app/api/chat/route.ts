import { NextResponse } from "next/server";
import { runJigga, runJiggaJson } from "@/lib/jigga-cli";

/** The Chat page ↔ webchat channel boundary (JIGGA M2).
 *
 * GET  ?conversation=web&limit=200 → `jigga webchat history --json`
 * POST {text, conversation?}       → `jigga webchat send --wait --json`
 *
 * `send --wait` appends the message to the file-backed inbox, runs a
 * webchat-only ingest inline (identity → task → agent run — the same pipeline
 * Telegram rides), and returns the replies the agent wrote to the outbox via
 * its webchat.send_message tool. First send auto-enables the channel and
 * grants the routed agent the reply tool — no setup screen needed. */

export type ChatEntry = {
  id: string;
  conversation_id: string;
  sender: string;
  text: string;
  ts: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const conversation = url.searchParams.get("conversation") ?? "web";
  const limit = url.searchParams.get("limit") ?? "200";
  if (conversation.startsWith("-") || !/^\d+$/.test(limit)) {
    return NextResponse.json({ ok: false, error: "bad params" }, { status: 400 });
  }
  try {
    const entries = await runJiggaJson<ChatEntry[]>([
      "webchat", "history", "--json", "--conversation", conversation, "--limit", limit,
    ]);
    return NextResponse.json({ ok: true, entries });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    text?: string; conversation?: string;
  };
  const text = String(body.text ?? "").trim();
  const conversation = String(body.conversation ?? "web").trim() || "web";
  if (!text || text.startsWith("-") || conversation.startsWith("-")) {
    return NextResponse.json({ ok: false, error: "text required" }, { status: 400 });
  }
  const res = await runJigga([
    "webchat", "send", "--wait", "--json", "--text", text, "--conversation", conversation,
  ]);
  if (!res.ok) {
    // CLI errors print to stdout under --json paths too — surface both.
    const detail = res.stderr.trim() || res.stdout.trim() || `send failed (exit=${res.exitCode})`;
    return NextResponse.json({ ok: false, error: detail }, { status: 500 });
  }
  try {
    return NextResponse.json({ ok: true, ...JSON.parse(res.stdout) });
  } catch {
    return NextResponse.json({ ok: true, replies: [] });
  }
}
