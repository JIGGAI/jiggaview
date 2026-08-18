"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { ChatEntry } from "@/app/api/chat/route";
import type { Conversation } from "@/app/api/conversations/route";

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
  model?: string | null;
  team?: string | null;
  tools?: number;
};

// The default agent answers the classic `web` thread (no --agent flag), so
// chat history from before the picker existed stays attached to it.
const DEFAULT_THREAD = "web";

function Bubble({ entry, pending }: { entry: ChatEntry; pending?: "sending" | "queued" }) {
  const mine = entry.sender !== "agent";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={
          "max-w-[75%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap break-words " +
          (mine
            ? "bg-[color:var(--ck-accent,#e8604c)] text-white rounded-br-sm"
            : "bg-white/10 text-[color:var(--ck-text-primary)] rounded-bl-sm") +
          // Queued messages are real and durable, just not started — dimmed
          // rather than ghosted, because "unsent" would be a lie.
          (pending === "queued" ? " opacity-70" : "")
        }
      >
        {entry.text}
        <div className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-[color:var(--ck-text-tertiary)]"}`}>
          {pending === "sending"
            ? "sent · the agent is working on this now"
            : pending === "queued"
              ? "queued · runs after the current reply"
              : `${entry.sender} · ${String(entry.ts ?? "").slice(11, 16)}`}
        </div>
      </div>
    </div>
  );
}

function AgentRail({
  agents,
  selected,
  onSelect,
  threads,
  selectedThread,
  onSelectThread,
}: {
  agents: Agent[];
  selected: string;
  onSelect: (id: string) => void;
  threads: Conversation[];
  selectedThread: string;
  onSelectThread: (id: string) => void;
}) {
  return (
    <div className="w-56 shrink-0 overflow-y-auto border-r border-[color:var(--ck-border-subtle)] p-2">
      <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
        Agents
      </div>
      {agents.map((a) => {
        const active = a.id === selected;
        return (
          <button
            key={a.id}
            onClick={() => onSelect(a.id)}
            title={a.role}
            className={
              "mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors " +
              (active
                ? "bg-white/10 text-[color:var(--ck-text-primary)]"
                : "text-[color:var(--ck-text-secondary)] hover:bg-white/5")
            }
          >
            <div className="truncate font-medium">{a.name}</div>
            <div className="truncate text-[10px] text-[color:var(--ck-text-tertiary)]">
              {a.isDefault ? "default" : a.id}
            </div>
          </button>
        );
      })}
      {agents.length === 0 ? (
        <div className="px-3 py-2 text-xs text-[color:var(--ck-text-tertiary)]">
          No agents available to chat with.
        </div>
      ) : null}
      <div className="mt-3 border-t border-[color:var(--ck-border-subtle)] px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
        Threads
      </div>
      {threads.map((t) => {
        const active = t.conversation_id === selectedThread;
        return (
          <button
            key={t.conversation_id}
            onClick={() => onSelectThread(t.conversation_id)}
            className={
              "mb-1 block w-full rounded-lg px-3 py-1.5 text-left transition-colors " +
              (active
                ? "bg-white/10 text-[color:var(--ck-text-primary)]"
                : "text-[color:var(--ck-text-secondary)] hover:bg-white/5")
            }
          >
            <div className="truncate text-xs font-medium">{t.conversation_id}</div>
            <div className="truncate text-[10px] text-[color:var(--ck-text-tertiary)]">
              {t.last_text || "(empty)"}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Who you are talking to, above the thread.
 *
 * The rail says which agent is selected; this says who it IS — the role it was
 * given, the model answering, and whether it can reach tools — so you are not
 * guessing why an answer looks the way it does. Edit jumps to the agent's own
 * page and comes back here.
 */
function toolLabel(count: number | undefined): string | null {
  if (!count) return null;
  return `${count} tool${count === 1 ? "" : "s"}`;
}

function AgentHeader({
  agent,
  thread,
  onNewThread,
}: {
  agent: Agent | undefined;
  thread: string;
  onNewThread: () => void;
}) {
  if (!agent) return null;
  const initials = (agent.name || agent.id).slice(0, 2).toUpperCase();
  const facts = [agent.role, agent.model, agent.team, toolLabel(agent.tools)].filter(Boolean);
  return (
    <div className="flex items-center gap-3 border-b border-[color:var(--ck-border-subtle)] px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-[color:var(--ck-text-primary)]">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium text-[color:var(--ck-text-primary)]">
            {agent.name}
          </span>
          {agent.isDefault ? (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-[color:var(--ck-text-secondary)]">
              default
            </span>
          ) : null}
        </div>
        <div className="truncate text-xs text-[color:var(--ck-text-tertiary)]">
          {facts.join(" · ")}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden font-mono text-[10px] text-[color:var(--ck-text-tertiary)] sm:inline">
          {thread}
        </span>
        <button
          onClick={onNewThread}
          title="Start a fresh conversation with this agent"
          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
        >
          + New thread
        </button>
        <Link
          href={`/agents/${encodeURIComponent(agent.id)}?returnTo=/chat`}
          title="View or edit this agent"
          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-[color:var(--ck-text-secondary)] hover:bg-white/10"
        >
          Edit
        </Link>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<string>("");   // agent id; "" until roster loads
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedThread, setSelectedThread] = useState<string>(""); // "" = the agent's primary thread
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);

  const current = agents.find((a) => a.id === selected);
  // The default agent's primary thread is `web` (pre-picker history lives
  // there); everyone else's primary thread is their id.
  const primaryThread = current?.isDefault ? DEFAULT_THREAD : selected || DEFAULT_THREAD;
  const conversation = selectedThread || primaryThread;
  // This agent's threads: its primary first (synthesized if it has no
  // messages yet), then every conversation targeted at it, newest first.
  const agentThreads: Conversation[] = (() => {
    const mine = conversations.filter(
      (c) =>
        c.conversation_id !== primaryThread &&
        (c.agent === selected || (current?.isDefault && c.agent === null))
    );
    const primary = conversations.find((c) => c.conversation_id === primaryThread) ?? {
      conversation_id: primaryThread,
      agent: current?.isDefault ? null : selected,
      count: 0,
      last_ts: "",
      last_text: "",
      last_sender: "",
    };
    return [primary, ...mine];
  })();

  const refreshConversations = useCallback(async () => {
    try {
      const json = await fetchJson<{ conversations?: Conversation[] }>("/api/conversations", {
        cache: "no-store",
      });
      setConversations(json.conversations ?? []);
    } catch {
      /* thread list is an enhancement — keep the last good one */
    }
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    (async () => {
      try {
        const json = await fetchJson<{ agents?: Agent[] }>("/api/agents", { cache: "no-store" });
        // Disabled agents cannot run, so they are not chat partners. They
        // are still visible (and re-enablable) on the Agents page.
        const roster = (json.agents ?? []).filter((a) => !a.disabled);
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
    if (!text || !current) return;
    setInput("");

    // Already waiting on the agent? Hand the message to the runtime WITHOUT
    // asking it to run now. It lands in the file-backed inbox immediately —
    // durable, ordered, surviving a refresh or a closed tab — and the
    // supervisor picks it up on its next tick. Deliberately no nudge: starting
    // a second run of an agent that is mid-answer is the race this avoids.
    if (sendingRef.current) {
      const optimistic: ChatEntry = {
        id: `queued-${Date.now()}`,
        conversation_id: conversation,
        sender: "you",
        text,
        ts: new Date().toISOString(),
      };
      setEntries((prev) => [...prev, optimistic]);
      try {
        await fetchJson("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            conversation,
            agent: current.isDefault && conversation === DEFAULT_THREAD ? "" : current.id,
            wait: false,
          }),
        });
      } catch (e) {
        setEntries((prev) => prev.filter((entry) => entry.id !== optimistic.id));
        setError(e instanceof Error ? e.message : String(e));
      }
      return;
    }

    setError(null);
    setSending(true);
    sendingRef.current = true;
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
          // The default agent answers its classic `web` thread untargeted
          // (back-compat); every other thread is addressed explicitly so
          // routing + thread attribution work.
          agent: current.isDefault && conversation === DEFAULT_THREAD ? "" : current.id,
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
      refreshConversations();
    }
  }

  // Pending is derived, not stored: "you said something the agent has not
  // answered yet" is already in the thread, so it survives a refresh and cannot
  // drift from what the runtime actually holds.
  const lastAgentReplyIndex = entries.map((e) => e.sender).lastIndexOf("agent");
  const firstUnansweredIndex = lastAgentReplyIndex + 1;
  const queuedCount = Math.max(0, entries.length - firstUnansweredIndex - (sending ? 1 : 0));

  function pendingState(entry: ChatEntry, index: number): "sending" | "queued" | undefined {
    if (entry.sender === "agent" || index <= lastAgentReplyIndex) return undefined;
    // The one being answered right now is not "queued" — it is in flight.
    if (index === firstUnansweredIndex && sending) return "sending";
    return "queued";
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
        <AgentRail
          agents={agents}
          selected={selected}
          onSelect={(id) => {
            setSelected(id);
            setSelectedThread("");   // back to the new agent's primary thread
          }}
          threads={agentThreads}
          selectedThread={conversation}
          onSelectThread={setSelectedThread}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <AgentHeader
            agent={current}
            thread={conversation}
            onNewThread={() =>
              setSelectedThread(`${selected || "web"}-${Math.random().toString(36).slice(2, 7)}`)
            }
          />
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {entries.length === 0 && !sending ? (
              <p className="pt-8 text-center text-sm text-[color:var(--ck-text-tertiary)]">
                {current
                  ? `No messages with ${current.name} yet — say hello.`
                  : "Loading agents…"}
              </p>
            ) : null}
            {entries.map((e, i) => (
              <Bubble key={e.id} entry={e} pending={pendingState(e, i)} />
            ))}
            {sending ? (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-white/10 px-4 py-2 text-sm text-[color:var(--ck-text-tertiary)]">
                  <span className="animate-pulse">{current?.name ?? "agent"} is thinking…</span>
                </div>
              </div>
            ) : null}
            {queuedCount > 0 ? (
              <p className="text-center text-[11px] text-[color:var(--ck-text-tertiary)]">
                {queuedCount} message{queuedCount === 1 ? "" : "s"} queued — delivered on the
                supervisor&apos;s next tick, in order.
              </p>
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
                  ? `Type ahead — ${current?.name ?? "the agent"} gets this next`
                  : `Message ${current?.name ?? "your agent"}…`
              }
              autoFocus
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)] outline-none placeholder:text-[color:var(--ck-text-tertiary)] focus:border-white/25 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!input.trim() || !current}
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
