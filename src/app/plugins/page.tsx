import { runJiggaJson } from "@/lib/jigga-cli";
import PluginsClient from "./plugins-client";
import type { Plugin } from "@/app/api/plugins/route";

export const dynamic = "force-dynamic";

export default async function PluginsPage() {
  let plugins: Plugin[] = [];
  let error: string | null = null;
  try {
    plugins = await runJiggaJson<Plugin[]>(["plugins", "list", "--json"]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="w-full">
      <h1 className="text-xl font-semibold">Plugins</h1>
      <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
        Out-of-process apps JIGGA supervises as their own services — this dashboard is one of
        them. Plugins bring their own runtime, which is how the core stays stdlib + PyYAML.
      </p>
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      <PluginsClient plugins={plugins} />
    </div>
  );
}
