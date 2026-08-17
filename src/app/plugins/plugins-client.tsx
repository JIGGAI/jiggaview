"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetch-json";
import type { Plugin } from "@/app/api/plugins/route";

const secondaryBtn =
  "rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50";

export default function PluginsClient({ plugins }: { plugins: Plugin[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function control(name: string, action: "start" | "stop") {
    setBusy(name);
    setMessage(null);
    try {
      await fetchJson("/api/plugins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, action }),
      });
      setIsError(false);
      setMessage(
        action === "stop"
          ? `Stopped ${name}. Its service unit is removed; Start reinstalls it.`
          : `Started ${name}.`,
      );
      router.refresh();
    } catch (e) {
      setIsError(true);
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  if (plugins.length === 0) {
    return (
      <div className="ck-card mt-4 p-4 text-sm text-[color:var(--ck-text-tertiary)]">
        No plugins installed. Install one from a checkout or a git URL:{" "}
        <span className="font-mono">jigga plugins install &lt;dir-or-url&gt;</span> — it is scanned,
        approved, set up, and supervised as its own service.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {message ? (
        <div
          className={
            "rounded-lg border p-3 text-sm " +
            (isError
              ? "border-red-400/30 bg-red-500/10 text-red-100"
              : "border-emerald-400/30 bg-emerald-500/10 text-emerald-100")
          }
        >
          {message}
        </div>
      ) : null}

      {plugins.map((p) => {
        const self = typeof window !== "undefined" && p.port
          ? window.location.port === String(p.port)
          : false;
        return (
          <div key={p.name} className="ck-card flex items-start justify-between gap-4 p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{p.name}</span>
                {p.version ? (
                  <span className="font-mono text-xs text-[color:var(--ck-text-tertiary)]">
                    v{p.version}
                  </span>
                ) : null}
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-[10px] " +
                    (p.running
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-white/10 text-[color:var(--ck-text-secondary)]")
                  }
                >
                  {p.running ? "running" : "stopped"}
                </span>
                {self ? (
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-200">
                    serving this page
                  </span>
                ) : null}
              </div>
              {p.summary ? (
                <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">{p.summary}</p>
              ) : null}
              <div className="mt-1 truncate font-mono text-[10px] text-[color:var(--ck-text-tertiary)]">
                {p.dir}
                {p.port ? ` · :${p.port}` : ""}
                {p.installed_service ? "" : " · no service unit"}
              </div>
            </div>
            <div className="shrink-0">
              {p.running ? (
                <button
                  className={secondaryBtn}
                  disabled={busy === p.name}
                  // Stopping the plugin that serves this page would take the
                  // page down with it — say so rather than letting someone
                  // discover it by clicking.
                  title={self ? "This would stop the dashboard you are reading" : undefined}
                  onClick={() => void control(p.name, "stop")}
                >
                  {busy === p.name ? "Stopping…" : self ? "Stop (this dashboard)" : "Stop"}
                </button>
              ) : (
                <button
                  className={secondaryBtn}
                  disabled={busy === p.name}
                  onClick={() => void control(p.name, "start")}
                >
                  {busy === p.name ? "Starting…" : "Start"}
                </button>
              )}
            </div>
          </div>
        );
      })}

      <p className="text-xs text-[color:var(--ck-text-tertiary)]">
        Installing a plugin runs its setup commands and records an approval, so it is done at a
        terminal with the source in front of you:{" "}
        <span className="font-mono">jigga plugins install &lt;dir-or-url&gt;</span>.
      </p>
    </div>
  );
}
