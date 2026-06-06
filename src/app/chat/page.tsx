"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { ChatEntry } from "@/app/api/chat/route";

/** Chat — the browser as a JIGGA channel (webchat, M2).
 *
 * Messages ride the real channel pipeline: POST /api/chat shells
 * `jigga webchat send --wait`, the default agent runs, and its
 * webchat.send_message replies render here. History is the merged
 * inbox/outbox jsonl — refresh-safe, auditable, greppable. */

const POLL_MS = 4000;

function Bubble({ entry }: { entry: ChatEntry }) {
  const mine = entry.sender !== "agent";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={
          "max-w-[75%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap break-words " +
          (mine
            ? "bg-[color:var(--ck-accent,#e8604c)] text-white rounded-br-sm"
            : "bg-white/10 text-[color:var(--ck-text-primary)] rounded-bl-sm")
        }
      >
        {entry.text}
        <div className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-[color:var(--ck-text-tertiary)]"}`}>
          {entry.sender} · {String(entry.ts ?? "").slice(11, 16)}
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (sendingRef.current) return; // don't fight the optimistic state mid-send
    try {
      const json = await fetchJson<{ entries?: ChatEntry[] }>("/api/chat", { cache: "no-store" });
      setEntries(json.entries ?? []);
    } catch {
      /* transient poll failure — keep the last good thread */
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    setSending(true);
    sendingRef.current = true;
    setInput("");
    // Optimistic echo — replaced by the canonical entry on the next refresh.
    const optimistic: ChatEntry = {
      id: `optimistic-${Date.now()}`,
      conversation_id: "web",
      sender: "you",
      text,
      ts: new Date().toISOString(),
    };
    setEntries((prev) => [...prev, optimistic]);
    try {
      const json = await fetchJson<{ message?: ChatEntry; replies?: ChatEntry[] }>("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      setEntries((prev) => [
        ...prev.filter((e) => e.id !== optimistic.id),
        ...(json.message ? [json.message] : [optimistic]),
        ...(json.replies ?? []),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      sendingRef.current = false;
      setSending(false);
      refresh();
    }
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] w-full flex-col">
      <div>
        <h1 className="text-xl font-semibold">Chat</h1>
        <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
          Talk to your default agent — messages ride the same channel pipeline as Telegram,
          file-backed and audited.
        </p>
      </div>
      <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-xl border border-[color:var(--ck-border-subtle)]">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {entries.length === 0 && !sending ? (
            <p className="pt-8 text-center text-sm text-[color:var(--ck-text-tertiary)]">
              No messages yet — say hello. The first message enables the webchat channel automatically.
            </p>
          ) : null}
          {entries.map((e) => (
            <Bubble key={e.id} entry={e} />
          ))}
          {sending ? (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-white/10 px-4 py-2 text-sm text-[color:var(--ck-text-tertiary)]">
                <span className="animate-pulse">agent is thinking…</span>
              </div>
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
        {error ? (
          <div className="border-t border-[color:var(--ck-border-subtle)] px-4 py-2 text-sm text-red-400">
            {error}
          </div>
        ) : null}
        <form
          className="flex gap-2 border-t border-[color:var(--ck-border-subtle)] p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={sending ? "Waiting for the agent…" : "Message your agent…"}
            disabled={sending}
            autoFocus
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)] outline-none placeholder:text-[color:var(--ck-text-tertiary)] focus:border-white/25 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="rounded-lg bg-[color:var(--ck-accent,#e8604c)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
