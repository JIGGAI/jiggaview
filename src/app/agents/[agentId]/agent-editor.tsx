"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileListWithOptionalToggle } from "@/components/FileListWithOptionalToggle";
import { fetchJson } from "@/lib/fetch-json";

type Tab = "identity" | "config" | "files";
type FileEntry = { name: string; missing: boolean; required?: boolean };

const inputCls =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]";
const primaryBtn =
  "rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50";
const secondaryBtn =
  "rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50";

function MessageBox({ message, error }: { message: string | null; error: boolean }) {
  if (!message) return null;
  return (
    <div
      className={
        error
          ? "rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100"
          : "rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100"
      }
    >
      {message}
    </div>
  );
}

export default function AgentEditor({
  agentId,
  agent,
}: {
  agentId: string;
  agent: Record<string, unknown>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/";
  const [tab, setTab] = useState<Tab>("identity");
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);

  // identity
  const [name, setName] = useState(String(agent.name ?? ""));
  const [role, setRole] = useState(String(agent.role ?? ""));
  const [description, setDescription] = useState(String(agent.description ?? ""));
  // config
  const [model, setModel] = useState(String(agent.model ?? ""));
  const [permissionMode, setPermissionMode] = useState(String(agent.permission_mode ?? ""));
  const [tools, setTools] = useState(
    (Array.isArray(agent.tools) ? (agent.tools as string[]) : []).join("\n"),
  );
  const [workflows, setWorkflows] = useState(
    (Array.isArray(agent.workflows) ? (agent.workflows as string[]) : []).join("\n"),
  );
  const [permissions, setPermissions] = useState(
    JSON.stringify(agent.permissions ?? {}, null, 2),
  );
  const [delegation, setDelegation] = useState(
    JSON.stringify(agent.delegation ?? {}, null, 2),
  );
  // files
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [showOptionalFiles, setShowOptionalFiles] = useState(false);
  const [fileName, setFileName] = useState("SOUL.md");
  const [fileContent, setFileContent] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);

  async function setKeys(pairs: Array<[string, string]>, okMessage: string) {
    setBusy(true);
    setMessage(null);
    try {
      for (const [key, value] of pairs) {
        await fetchJson("/api/entity", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: "agent", id: agentId, key, value, viaRecipe: true }),
        });
      }
      setIsError(false);
      setMessage(okMessage);
      router.refresh();
    } catch (e) {
      setIsError(true);
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const loadFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      const out = await fetchJson<{ files: FileEntry[] }>(
        `/api/files?kind=agent&id=${encodeURIComponent(agentId)}`,
        { cache: "no-store" },
      );
      setFiles(out.files ?? []);
    } catch {
      setFiles([]);
    } finally {
      setFilesLoading(false);
    }
  }, [agentId]);

  const loadFile = useCallback(
    async (name: string) => {
      setFileName(name);
      setFileError(null);
      try {
        const out = await fetchJson<{ content: string }>(
          `/api/files?kind=agent&id=${encodeURIComponent(agentId)}&name=${encodeURIComponent(name)}`,
          { cache: "no-store" },
        );
        setFileContent(out.content ?? "");
      } catch (e) {
        setFileError(e instanceof Error ? e.message : String(e));
      }
    },
    [agentId],
  );

  useEffect(() => {
    if (tab === "files") {
      void loadFiles();
      void loadFile("SOUL.md");
    }
  }, [tab, loadFiles, loadFile]);

  async function saveFile() {
    setBusy(true);
    setFileError(null);
    try {
      await fetchJson("/api/files", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "agent", id: agentId, name: fileName, content: fileContent }),
      });
      await loadFiles();
    } catch (e) {
      setFileError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const tabBtn = (t: Tab, label: string) => (
    <button
      key={t}
      onClick={() => setTab(t)}
      className={
        "rounded-lg px-3 py-1.5 text-sm font-medium " +
        (tab === t
          ? "bg-[var(--ck-accent-red)] text-white"
          : "border border-white/10 bg-white/5 text-[color:var(--ck-text-secondary)] hover:bg-white/10")
      }
    >
      {label}
    </button>
  );

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href={returnTo} className="text-xs text-[color:var(--ck-text-tertiary)] hover:text-[color:var(--ck-text-secondary)]">
            ← Back
          </Link>
          <h1 className="mt-1 text-xl font-semibold">{name || agentId}</h1>
          <div className="font-mono text-xs text-[color:var(--ck-text-tertiary)]">{agentId}</div>
        </div>
        <div className="text-right text-xs text-[color:var(--ck-text-tertiary)]">Agent: {agentId}</div>
      </div>

      <div className="sticky top-0 z-10 mt-4 flex gap-2 bg-[color:var(--ck-bg-primary)] py-2">
        {tabBtn("identity", "Identity")}
        {tabBtn("config", "Config")}
        {tabBtn("files", "Files")}
      </div>

      <div className="mt-4 space-y-3">
        <MessageBox message={message} error={isError} />

        {tab === "identity" ? (
          <div className="ck-card max-w-2xl p-4">
            <h2 className="text-sm font-medium">Identity</h2>
            <div className="mt-3 space-y-3">
              <div>
                <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Name</div>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Role (the system prompt line)</div>
                <input className={inputCls} value={role} onChange={(e) => setRole(e.target.value)} />
              </div>
              <div>
                <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Description</div>
                <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button
                  className={primaryBtn}
                  disabled={busy}
                  onClick={() =>
                    setKeys(
                      [["name", name], ["role", role], ["description", description]],
                      "Saved identity via jigga agents set",
                    )
                  }
                >
                  Save
                </button>
                <button
                  className={secondaryBtn}
                  disabled={busy}
                  onClick={async () => {
                    await setKeys(
                      [["name", name], ["role", role], ["description", description]],
                      "Saved",
                    );
                    router.push(returnTo);
                  }}
                >
                  Save &amp; return
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "config" ? (
          <div className="ck-card max-w-3xl p-4">
            <h2 className="text-sm font-medium">Config</h2>
            <p className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
              Recipe-first: edits write the agent&apos;s definition in its team recipe
              (<code>jigga agents set --recipe</code>) and regenerate the yaml from it —
              validated, audited, portable. Breaking values roll back.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Model</div>
                <input className={inputCls} placeholder="profile:default" value={model} onChange={(e) => setModel(e.target.value)} />
              </div>
              <div>
                <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Permission mode</div>
                <select className={inputCls} value={permissionMode} onChange={(e) => setPermissionMode(e.target.value)}>
                  <option value="">(default)</option>
                  {["plan_only", "ask", "accept_edits", "autonomous", "locked_down"].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Tools (one per line)</div>
                <textarea className={inputCls + " h-36 resize-none font-mono"} value={tools} onChange={(e) => setTools(e.target.value)} />
              </div>
              <div>
                <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Workflows (one per line)</div>
                <textarea className={inputCls + " h-36 resize-none font-mono"} value={workflows} onChange={(e) => setWorkflows(e.target.value)} />
              </div>
              <div>
                <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Permissions (JSON)</div>
                <textarea className={inputCls + " h-48 resize-none font-mono"} value={permissions} onChange={(e) => setPermissions(e.target.value)} />
              </div>
              <div>
                <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Delegation (JSON)</div>
                <textarea className={inputCls + " h-48 resize-none font-mono"} value={delegation} onChange={(e) => setDelegation(e.target.value)} />
              </div>
            </div>
            <div className="mt-4">
              <button
                className={primaryBtn}
                disabled={busy}
                onClick={() => {
                  const lines = (v: string) => JSON.stringify(v.split("\n").map((s) => s.trim()).filter(Boolean));
                  const pairs: Array<[string, string]> = [
                    ["model", model],
                    ["tools", lines(tools)],
                    ["workflows", lines(workflows)],
                    ["permissions", permissions],
                    ["delegation", delegation],
                  ];
                  if (permissionMode) pairs.push(["permission_mode", permissionMode]);
                  void setKeys(pairs, "Saved agent config (recipe updated)");
                }}
              >
                Save config
              </button>
            </div>
          </div>
        ) : null}

        {tab === "files" ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <FileListWithOptionalToggle
              title="Agent files"
              files={files}
              loading={filesLoading}
              showOptionalFiles={showOptionalFiles}
              onShowOptionalChange={setShowOptionalFiles}
              selectedFileName={fileName}
              onSelectFile={(n) => void loadFile(n)}
            />
            <div className="ck-card p-4 lg:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Edit: {fileName}</h2>
                <button className={primaryBtn} disabled={busy} onClick={() => void saveFile()}>
                  Save file
                </button>
              </div>
              {fileError ? (
                <div className="mt-2 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
                  {fileError}
                </div>
              ) : null}
              <textarea
                className="mt-3 h-[55vh] w-full resize-none rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs text-[color:var(--ck-text-primary)]"
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
