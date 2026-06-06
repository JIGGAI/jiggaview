"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetch-json";

export default function SettingsClient({ config }: { config: Record<string, unknown> }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function setConfig(k: string, v: string) {
    setBusy(true);
    setMessage(null);
    try {
      const out = await fetchJson<{ key: string; old: unknown; new: unknown }>("/api/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: k, value: v }),
      });
      setMessage(`${out.key}: ${JSON.stringify(out.old)} → ${JSON.stringify(out.new)}`);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-xl border border-[color:var(--ck-border-subtle)] bg-white/5 p-4">
        <h2 className="text-sm font-semibold">Set a key</h2>
        <p className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
          Dotted path, JSON-coerced value (true / 42 / [..] / plain string).
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
            placeholder="channels.default"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <input
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
            placeholder="telegram"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button
            className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/15 disabled:opacity-50"
            disabled={busy || !key}
            onClick={() => setConfig(key, value)}
          >
            {busy ? "Saving…" : "Set"}
          </button>
        </div>
        {message ? <p className="mt-2 text-xs text-[color:var(--ck-text-secondary)]">{message}</p> : null}
      </div>

      <div className="rounded-xl border border-[color:var(--ck-border-subtle)] bg-white/5 p-4">
        <h2 className="text-sm font-semibold">Current config</h2>
        <pre className="mt-2 max-h-[28rem] overflow-auto rounded-lg bg-black/30 p-3 text-xs">
          {JSON.stringify(config, null, 2)}
        </pre>
      </div>
    </div>
  );
}
