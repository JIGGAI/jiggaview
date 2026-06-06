import { runJiggaJson } from "@/lib/jigga-cli";
import SettingsClient from "./settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let config: Record<string, unknown> = {};
  let error: string | null = null;
  try {
    config = await runJiggaJson<Record<string, unknown>>(["config", "get", "--json"]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  return (
    <div className="w-full">
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
        Runtime config (<code>~/.jigga/config.yaml</code>) — edits go through{" "}
        <code>jigga config set</code> and are audited.
      </p>
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      <SettingsClient config={config} />
    </div>
  );
}
