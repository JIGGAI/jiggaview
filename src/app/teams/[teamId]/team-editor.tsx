"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetch-json";
import { MemoryTab } from "./memory-tab";
import { WorkspaceFiles } from "@/components/WorkspaceFiles";

type Tab = "agents" | "recipe" | "files" | "memory" | "cron";
type FileEntry = import("@/app/api/files/route").WorkspaceFile;
type Member = { id?: string; role?: string; required?: boolean };
type AgentListItem = {
  id: string; name: string; role: string; model?: string | null;
  default: boolean; schedules: number; team?: string | null;
};

const inputCls =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]";
const primaryBtn =
  "rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50";
const greenBtn =
  "rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50";
const secondaryBtn =
  "rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50";

export default function TeamEditor({
  teamId,
  team,
  teamAgents,
  allAgents,
  disabled,
}: {
  teamId: string;
  team: Record<string, unknown>;
  teamAgents: AgentListItem[];
  allAgents: AgentListItem[];
  disabled: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("agents");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const members = Array.isArray(team.agents) ? (team.agents as Member[]) : [];
  const recipeStem = recipeStemFor(teamId);
  // Existing agents (on other teams / solo) that aren't already on this team —
  // candidates for "add an existing agent".
  const onThisTeam = new Set(teamAgents.map((a) => a.id));
  const addCandidates = allAgents.filter((a) => a.team !== teamId && !onThisTeam.has(a.id));

  // agents tab: add-member form
  const [newRole, setNewRole] = useState("");
  const [newAgentId, setNewAgentId] = useState("");
  // agents tab: add an EXISTING agent (from any team) to this team
  const [pickAgentId, setPickAgentId] = useState("");
  // recipe tab
  const [recipeContent, setRecipeContent] = useState("");
  const [recipeLoaded, setRecipeLoaded] = useState(false);
  const [recipeError, setRecipeError] = useState<string | null>(null);
  // files tab
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [fileName, setFileName] = useState("TEAM.md");
  const [fileContent, setFileContent] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);

  function note(text: string, error = false) {
    setIsError(error);
    setMessage(text);
  }

  function recipeStemFor(id: string): string {
    return id.replaceAll("_", "-");
  }

  async function staffMember(memberId: string, role?: string) {
    setBusy(true);
    try {
      await fetchJson("/api/team-staff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ team: teamId, member: memberId, role }),
      });
      note(`Staffed ${memberId} — agent created from the team recipe (now in ~/.jigga/recipes).`);
      router.refresh();
    } catch (e) {
      note(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }

  async function toggleDisabled() {
    setBusy(true);
    try {
      await fetchJson("/api/disable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "team", id: teamId, disabled: !disabled }),
      });
      note(disabled
        ? "Team enabled — the supervisor resumes waking its members next tick."
        : "Team disabled — members won't be woken; tasks/mail queue and nothing is lost.");
      router.refresh();
    } catch (e) {
      note(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }

  async function addMember() {
    const id = newAgentId.trim();
    const role = newRole.trim() || id;
    if (!id) return;
    setBusy(true);
    try {
      await fetchJson("/api/team-staff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ team: teamId, member: id, role }),
      });
      note(`Added and staffed ${id} — agent created from the team recipe.`);
      setNewAgentId("");
      setNewRole("");
      router.refresh();
    } catch (e) {
      note(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }

  async function addExistingAgent() {
    const agent = pickAgentId.trim();
    if (!agent) return;
    setBusy(true);
    try {
      await fetchJson("/api/team-add-agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ team: teamId, agent }),
      });
      note(`Added ${agent} to ${teamId} — its config was copied in as a new member.`);
      setPickAgentId("");
      router.refresh();
    } catch (e) {
      note(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }

  const loadRecipe = useCallback(async () => {
    setRecipeError(null);
    try {
      const out = await fetchJson<{ content: string }>(
        `/api/recipes/raw?name=${encodeURIComponent(recipeStem)}`,
        { cache: "no-store" },
      );
      setRecipeContent(out.content ?? "");
      setRecipeLoaded(true);
    } catch {
      setRecipeError(`No recipe found for ${recipeStem} — this team may be hand-written.`);
      setRecipeLoaded(true);
    }
  }, [recipeStem]);

  async function saveRecipe() {
    setBusy(true);
    setRecipeError(null);
    try {
      const out = await fetchJson<{ path?: string }>("/api/recipes/raw", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: recipeStem, content: recipeContent }),
      });
      note(`Saved team recipe: ${out.path ?? recipeStem}`);
    } catch (e) {
      setRecipeError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function publishChanges() {
    setBusy(true);
    try {
      await fetchJson("/api/recipes/scaffold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: recipeStem, id: teamId, overwrite: true }),
      });
      note("Published changes to active team (re-scaffolded from the recipe).");
      router.refresh();
    } catch (e) {
      note(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }

  const loadFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      const out = await fetchJson<{ files: FileEntry[] }>(
        `/api/files?kind=team&id=${encodeURIComponent(teamId)}&tree=1`,
        { cache: "no-store" },
      );
      setFiles(out.files ?? []);
    } catch {
      setFiles([]);
    } finally {
      setFilesLoading(false);
    }
  }, [teamId]);

  const loadFile = useCallback(
    async (name: string) => {
      setFileName(name);
      setFileError(null);
      try {
        const out = await fetchJson<{ content: string }>(
          `/api/files?kind=team&id=${encodeURIComponent(teamId)}&name=${encodeURIComponent(name)}`,
          { cache: "no-store" },
        );
        setFileContent(out.content ?? "");
      } catch (e) {
        setFileError(e instanceof Error ? e.message : String(e));
      }
    },
    [teamId],
  );

  async function saveFile() {
    setBusy(true);
    setFileError(null);
    try {
      await fetchJson("/api/files", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "team", id: teamId, name: fileName, content: fileContent }),
      });
      await loadFiles();
    } catch (e) {
      setFileError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runAgent(agentId: string) {
    setBusy(true);
    try {
      await fetchJson("/api/task", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Run your scheduled work loop now",
          assignee: agentId,
          description: "Manual run from jiggaview: act per your wake-schedule instructions.",
        }),
      });
      note(`Queued a run for ${agentId} — the supervisor picks it up within a tick.`);
    } catch (e) {
      note(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (tab === "recipe" && !recipeLoaded) void loadRecipe();
    if (tab === "files") {
      void loadFiles();
      void loadFile("TEAM.md");
    }
  }, [tab, recipeLoaded, loadRecipe, loadFiles, loadFile]);

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

  const staffed = new Set(teamAgents.map((a) => a.id));

  return (
    <div className="w-full">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-[color:var(--ck-text-tertiary)] hover:text-[color:var(--ck-text-primary)]"
      >
        <span aria-hidden>←</span> Back
      </Link>
      <div className="mt-2 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            {String(team.name ?? teamId)}
            {disabled ? (
              <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">disabled</span>
            ) : null}
          </h1>
          <div className="font-mono text-xs text-[color:var(--ck-text-tertiary)]">{teamId}</div>
        </div>
        <button className={secondaryBtn} disabled={busy} onClick={() => void toggleDisabled()}>
          {disabled ? "Enable team" : "Disable team"}
        </button>
      </div>

      <div className="sticky top-0 z-10 mt-4 flex gap-2 bg-[color:var(--ck-bg-primary)] py-2">
        {tabBtn("agents", "Agents")}
        {tabBtn("recipe", "Recipe")}
        {tabBtn("files", "Files")}
        {tabBtn("memory", "Memory")}
        {tabBtn("cron", "Cron")}
      </div>

      {message ? (
        <div
          className={
            "mt-3 rounded-lg border p-3 text-sm " +
            (isError
              ? "border-red-400/30 bg-red-500/10 text-red-100"
              : "border-emerald-400/30 bg-emerald-500/10 text-emerald-100")
          }
        >
          {message}
        </div>
      ) : null}

      {tab === "agents" ? (
        <div className="mt-4 space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {teamAgents.map((agent) => (
              <div key={agent.id} className="ck-card p-4">
                <div className="text-sm font-medium">
                  {agent.name || agent.id}
                  {agent.default ? <span className="text-[color:var(--ck-text-tertiary)]"> · default</span> : null}
                </div>
                <div className="mt-0.5 font-mono text-xs text-[color:var(--ck-text-tertiary)]">{agent.id}</div>
                {agent.model ? (
                  <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">· {agent.model}</div>
                ) : null}
                <div className="mt-3">
                  <Link
                    href={`/agents/${encodeURIComponent(agent.id)}?returnTo=/teams/${encodeURIComponent(teamId)}`}
                    className={secondaryBtn}
                  >
                    Edit
                  </Link>
                </div>
              </div>
            ))}
            {members
              .filter((m) => m.id && !staffed.has(String(m.id)))
              .map((m) => (
                <div key={m.id} className="ck-card border-dashed p-4 opacity-80">
                  <div className="text-sm font-medium">{m.id}</div>
                  <div className="mt-0.5 text-xs text-[color:var(--ck-text-tertiary)]">
                    {m.role} · membership-only (not staffed)
                  </div>
                  <div className="mt-3">
                    <button
                      className={primaryBtn}
                      disabled={busy}
                      onClick={() => void staffMember(String(m.id), m.role ? String(m.role) : undefined)}
                    >
                      Staff agent
                    </button>
                  </div>
                </div>
              ))}
            {teamAgents.length === 0 && members.length === 0 ? (
              <div className="text-sm text-[color:var(--ck-text-tertiary)]">No team agents detected.</div>
            ) : null}
          </div>

          <div className="ck-card max-w-2xl p-4">
            <h2 className="text-sm font-medium">Add agent</h2>
            <p className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
              Adds the member to the team recipe with a starter definition and creates the agent
              (batteries included — edit it right after).
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input className={inputCls} placeholder="agent id, e.g. meeting_prep_agent" value={newAgentId} onChange={(e) => setNewAgentId(e.target.value)} />
              <input className={inputCls} placeholder="role (optional), e.g. meeting prep" value={newRole} onChange={(e) => setNewRole(e.target.value)} />
              <button className={primaryBtn} disabled={busy || !newAgentId.trim()} onClick={() => void addMember()}>
                Add agent
              </button>
            </div>
          </div>

          <div className="ck-card max-w-2xl p-4">
            <h2 className="text-sm font-medium">Add an existing agent</h2>
            <p className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
              Copy another team&apos;s agent (with its config) onto this team as a new member.
              It joins as <span className="font-mono">{teamId}-&lt;role&gt;</span> — an independent copy.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <select
                className={inputCls}
                value={pickAgentId}
                disabled={busy || addCandidates.length === 0}
                onChange={(e) => setPickAgentId(e.target.value)}
              >
                <option value="">
                  {addCandidates.length ? "Select an agent…" : "No other agents available"}
                </option>
                {addCandidates.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || a.id} ({a.id}){a.team ? ` · ${a.team}` : ""}
                  </option>
                ))}
              </select>
              <button className={primaryBtn} disabled={busy || !pickAgentId} onClick={() => void addExistingAgent()}>
                Add agent
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "recipe" ? (
        <div className="mt-4 space-y-4">
          <div className="ck-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <button className={primaryBtn} disabled={busy} onClick={() => void saveRecipe()}>Save</button>
              <button className={greenBtn} disabled={busy} onClick={() => void publishChanges()}>Publish changes</button>
              <span className="text-xs text-[color:var(--ck-text-tertiary)]">
                Save writes your user-dir recipe copy (validated; overrides the bundled one). Publish re-scaffolds
                this team from it (<code>jigga recipes scaffold {recipeStem} --id {teamId} --overwrite</code>).
              </span>
            </div>
          </div>
          <div className="ck-card p-4">
            <h2 className="text-sm font-medium">Recipe markdown — {recipeStem}.md</h2>
            {recipeError ? (
              <div className="mt-2 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
                {recipeError}
              </div>
            ) : null}
            <textarea
              className="mt-3 h-[55vh] w-full resize-none rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs text-[color:var(--ck-text-primary)]"
              value={recipeContent}
              onChange={(e) => setRecipeContent(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      {tab === "files" ? (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <WorkspaceFiles
            files={files}
            loading={filesLoading}
            selected={fileName}
            onSelect={(n) => void loadFile(n)}
            emptyHint="No workspace yet — run `jigga team init` to scaffold one."
          />
          <div className="ck-card p-4 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Edit: {fileName}</h2>
              <button className={primaryBtn} disabled={busy} onClick={() => void saveFile()}>Save file</button>
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

      {/* Mounted only while selected, so it loads on open and re-reads on
          every return to the tab — an agent may have written since. */}
      {tab === "memory" ? <MemoryTab teamId={teamId} note={note} /> : null}

      {tab === "cron" ? (
        <div className="mt-4 space-y-3">
          {teamAgents.filter((a) => a.schedules > 0).map((agent) => (
            <div key={agent.id} className="ck-card flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium">{agent.name || agent.id}</div>
                <div className="text-xs text-[color:var(--ck-text-tertiary)]">
                  {agent.schedules} scheduled work-loop{agent.schedules === 1 ? "" : "s"}
                </div>
              </div>
              <button className={secondaryBtn} disabled={busy} onClick={() => void runAgent(agent.id)}>
                Run
              </button>
            </div>
          ))}
          {teamAgents.every((a) => a.schedules === 0) ? (
            <p className="text-sm text-[color:var(--ck-text-tertiary)]">No cron jobs detected for this team.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
