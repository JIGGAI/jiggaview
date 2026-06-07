import { NextResponse } from "next/server";
import { runJiggaJson } from "@/lib/jigga-cli";

/** GET → every webchat thread, newest activity first (the Chat page's
 * per-agent thread list). `agent` is the thread's targeted agent; null means
 * the channel-default thread. */

export type Conversation = {
  conversation_id: string;
  agent: string | null;
  count: number;
  last_ts: string;
  last_text: string;
  last_sender: string;
};

export async function GET() {
  try {
    const conversations = await runJiggaJson<Conversation[]>([
      "webchat", "conversations", "--json",
    ]);
    return NextResponse.json({ ok: true, conversations });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
