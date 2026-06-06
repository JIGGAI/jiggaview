"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetch-json";

type Member = { id?: string; role?: string; required?: boolean };

export default function TeamEditor({
  teamId,
  team,
}: {
  teamId: string;
  team: Record<string, unknown>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(String(team.name ?? ""));
  const [purpose, setPurpose] = useState(String(team.purpose ?? ""));
  const [assignee, setAssignee] = useState(
    String((team.routing as Record<string, unknown> | undefined)?.default_assignee ?? ""),
  );
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const members = Array.isArray(team.agents) ? (team.agents as Member[]) : [];

  async function setField(k: string, v: string) {
    setBusy(true);
    setMessage(null);
    try {
      const out = await fetchJson<{ key: string; old: unknown; new: unknown }>("/api/entity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "team", id: teamId, key: k, value: v }),
      });
      setMessage(`${out.key}: ${JSON.stringify(out.old)} → ${JSON.stringify(out.new)}`);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]";
  const button =
    "rounded-lg bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15 disabled:opacity-50";

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="rounded-xl border border-[color:var(--ck-border-subtle)] bg-white/5 p-4">
          <h2 className="text-sm font-semibold">Edit</h2>
          {message ? (
            <p className="mt-1 text-xs text-[color:var(--ck-text-secondary)]">{message}</p>
          ) : null}
          <div className="mt-3 space-y-3">
            {[
              ["name", name, setName] as const,
              ["purpose", purpose, setPurpose] as const,
              ["routing.default_assignee", assignee, setAssignee] as const,
            ].map(([k, v, set]) => (
              <div key={k} className="flex gap-2">
                <div className="w-52 shrink-0 pt-2 text-xs text-[color:var(--ck-text-tertiary)]">{k}</div>
                <input className={field} value={v} onChange={(e) => set(e.target.value)} />
                <button className={button} disabled={busy} onClick={() => setField(k, v)}>
                  Save
                </button>
              </div>
            ))}
            <div className="flex gap-2 border-t border-[color:var(--ck-border-subtle)] pt-3">
              <input
                className={field}
                placeholder="any.dotted.key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
              <input
                className={field}
                placeholder="value (JSON-coerced)"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <button className={button} disabled={busy || !key} onClick={() => setField(key, value)}>
                Set
              </button>
            </div>
            <p className="text-xs text-[color:var(--ck-text-tertiary)]">
              Edits go through <code>jigga team set</code> — validated (breaking values roll back) and audited.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[color:var(--ck-border-subtle)] bg-white/5 p-4">
          <h2 className="text-sm font-semibold">Members</h2>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
              <tr>
                <th className="py-1 pr-3">Agent</th>
                <th className="py-1 pr-3">Role</th>
                <th className="py-1">Required</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--ck-border-subtle)]">
              {members.map((m, i) => (
                <tr key={m.id ?? i}>
                  <td className="py-1.5 pr-3 font-mono text-xs">{m.id}</td>
                  <td className="py-1.5 pr-3">{m.role}</td>
                  <td className="py-1.5">{m.required === false ? "optional" : "required"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-[color:var(--ck-border-subtle)] bg-white/5 p-4">
        <h2 className="text-sm font-semibold">Team yaml</h2>
        <pre className="mt-2 max-h-[34rem] overflow-auto rounded-lg bg-black/30 p-3 text-xs">
          {JSON.stringify(team, null, 2)}
        </pre>
      </div>
    </div>
  );
}
