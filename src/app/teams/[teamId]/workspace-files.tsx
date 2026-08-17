"use client";

import { useMemo } from "react";
import type { WorkspaceFile } from "@/app/api/files/route";

/** The team's workspace as it actually is on disk, grouped by folder.
 *
 * The old list came from a four-entry manifest, so everything the team
 * accumulated at runtime — `shared-context/memory/team.jsonl`, agent outputs,
 * per-role dated memory under `roles/<agent>/memory/` — was invisible. Those
 * are the interesting files: they are what the team produced, not what a
 * scaffold promised.
 */

function folderOf(name: string): string {
  const cut = name.lastIndexOf("/");
  return cut === -1 ? "" : name.slice(0, cut);
}

function baseOf(name: string): string {
  return name.slice(name.lastIndexOf("/") + 1);
}

function size(bytes: number | undefined): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ago(iso: string | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function WorkspaceFiles({
  files,
  loading,
  selected,
  onSelect,
}: {
  files: WorkspaceFile[];
  loading: boolean;
  selected: string;
  onSelect: (name: string) => void;
}) {
  // Group by folder, root first, then alphabetically — the shape of the
  // directory rather than one flat list of slash-separated strings.
  const groups = useMemo(() => {
    const byFolder = new Map<string, WorkspaceFile[]>();
    for (const file of files) {
      const folder = folderOf(file.name);
      const bucket = byFolder.get(folder);
      if (bucket) bucket.push(file);
      else byFolder.set(folder, [file]);
    }
    return [...byFolder.entries()].sort(([a], [b]) => {
      if (a === "") return -1;
      if (b === "") return 1;
      return a.localeCompare(b);
    });
  }, [files]);

  if (loading) {
    return <div className="ck-card p-4 text-sm text-[color:var(--ck-text-tertiary)]">Loading files…</div>;
  }
  if (files.length === 0) {
    return (
      <div className="ck-card p-4 text-sm text-[color:var(--ck-text-tertiary)]">
        No workspace yet. Run <span className="font-mono">jigga team init</span> to scaffold one.
      </div>
    );
  }

  return (
    <div className="ck-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-medium">Workspace files</div>
        <div className="text-xs text-[color:var(--ck-text-tertiary)]">{files.length} files</div>
      </div>
      <div className="mt-3 max-h-[60vh] space-y-4 overflow-y-auto">
        {groups.map(([folder, entries]) => (
          <div key={folder || "(root)"}>
            <div className="font-mono text-xs text-[color:var(--ck-text-tertiary)]">
              {folder ? `${folder}/` : "./"}
            </div>
            <ul className="mt-1">
              {entries.map((file) => (
                <li key={file.name}>
                  <button
                    onClick={() => onSelect(file.name)}
                    className={
                      "flex w-full items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm " +
                      (selected === file.name
                        ? "bg-white/10 text-[color:var(--ck-text-primary)]"
                        : "text-[color:var(--ck-text-secondary)] hover:bg-white/5")
                    }
                  >
                    <span className={file.missing ? "italic opacity-60" : ""}>
                      {baseOf(file.name)}
                      {file.required ? (
                        <span className="ml-2 text-xs text-[color:var(--ck-text-tertiary)]">required</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-xs text-[color:var(--ck-text-tertiary)]">
                      {file.missing ? "missing" : `${size(file.bytes)} · ${ago(file.modified)}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
