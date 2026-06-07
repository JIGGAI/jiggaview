"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { ChatEntry } from "@/app/api/chat/route";

/** Chat — the browser as a JIGGA channel (webchat, M2 + multi-agent).
 *
 * Messages ride the real channel pipeline: POST /api/chat shells
 * `jigga webchat send --wait [--agent <id>]`, the targeted agent runs, and
 * its webchat.send_message replies render here. One thread per agent
 * (conversation = agent id; the default agent keeps the classic `web`
 * thread). History is the merged inbox/outbox jsonl — refresh-safe,
 * auditable, greppable. */

const POLL_MS = 4000;

type Agent = {
  id: string;
  name: string;
  role: string;
  isDefault: boolean;
  disabled: boolean;
};

// The default agent answers the classic `web` thread (no --agent flag), so
// chat history from before the picker existed stays attached to it.
const DEFAULT_THREAD = "web";

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

function AgentRail({
  agents,
  selected,
  onSelect,
}: {
  agents: Agent[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="w-52 shrink-0 overflow-y-auto border-r border-[color:var(--ck-border-subtle)] p-2">
      <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
        Agents
      </div>
      {agents.map((a) => {
        const active = a.id === selected;
        return (
          <button
            key={a.id}
            onClick={() => !a.disabled && onSelect(a.id)}
            disabled={a.disabled}
            title={a.disabled ? "Disabled — enable it on the agent page to chat" : a.role}
            className={
              "mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors " +
              (active
                ? "bg-white/10 text-[color:var(--ck-text-primary)]"
                : "text-[color:var(--ck-text-secondary)] hover:bg-white/5") +
              (a.disabled ? " cursor-not-allowed opacity-40" : "")
            }
          >
            <div className="truncate font-medium">{a.name}</div>
            <div className="truncate text-[10px] text-[color:var(--ck-text-tertiary)]">
              {a.isDefault ? "default" : a.id}
              {a.disabled ? " · disabled" : ""}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function ChatPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<string>("");   // agent id; "" until roster loads
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);

  const current = agents.find((a) => a.id === selected);
  // The default agent's thread is `web`; everyone else's thread is their id.
  const conversation = current?.isDefault ? DEFAULT_THREAD : selected || DEFAULT_THREAD;

  useEffect(() => {
    (async () => {
      try {
        const json = await fetchJson<{ agents?: Agent[] }>("/api/agents", { cache: "no-store" });
        const roster = json.agents ?? [];
        // Default agent first, then the rest alphabetically.
        roster.sort((a, b) =>
          a.isDefault !== b.isDefault ? (a.isDefault ? -1 : 1) : a.name.localeCompare(b.name)
        );
        setAgents(roster);
        setSelected((prev) => prev || roster.find((a) => a.isDefault)?.id || roster[0]?.id || "");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const refresh = useCallback(async () => {
    if (sendingRef.current) return; // don't fight the optimistic state mid-send
    try {
      const json = await fetchJson<{ entries?: ChatEntry[] }>(
        `/api/chat?conversation=${encodeURIComponent(conversation)}`,
        { cache: "no-store" }
      );
      setEntries(json.entries ?? []);
    } catch {
      /* transient poll failure — keep the last good thread */
    }
  }, [conversation]);

  useEffect(() => {
    setEntries([]);       // switching threads: clear, then load the new one
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending || !current) return;
    setError(null);
    setSending(true);
    sendingRef.current = true;
    setInput("");
    const optimistic: ChatEntry = {
      id: `optimistic-${Date.now()}`,
      conversation_id: conversation,
      sender: "you",
      text,
      ts: new Date().toISOString(),
    };
    setEntries((prev) => [...prev, optimistic]);
    try {
      const json = await fetchJson<{ message?: ChatEntry; replies?: ChatEntry[] }>("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          conversation,
          // The default agent answers the default thread without targeting;
          // every other agent is addressed explicitly.
          agent: current.isDefault ? "" : current.id,
        }),
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
          Talk to any agent — each gets its own thread, and messages ride the same channel
          pipeline as Telegram, file-backed and audited.
        </p>
      </div>
      <div className="mt-4 flex min-h-0 flex-1 rounded-xl border border-[color:var(--ck-border-subtle)]">
        <AgentRail agents={agents} selected={selected} onSelect={setSelected} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {entries.length === 0 && !sending ? (
              <p className="pt-8 text-center text-sm text-[color:var(--ck-text-tertiary)]">
                {current
                  ? `No messages with ${current.name} yet — say hello.`
                  : "Loading agents…"}
              </p>
            ) : null}
            {entries.map((e) => (
              <Bubble key={e.id} entry={e} />
            ))}
            {sending ? (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-white/10 px-4 py-2 text-sm text-[color:var(--ck-text-tertiary)]">
                  <span className="animate-pulse">{current?.name ?? "agent"} is thinking…</span>
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
              placeholder={
                sending
                  ? `Waiting for ${current?.name ?? "the agent"}…`
                  : `Message ${current?.name ?? "your agent"}…`
              }
              disabled={sending}
              autoFocus
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)] outline-none placeholder:text-[color:var(--ck-text-tertiary)] focus:border-white/25 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={sending || !input.trim() || !current}
              className="rounded-lg bg-[color:var(--ck-accent,#e8604c)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
