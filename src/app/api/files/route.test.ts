import { describe, expect, it, vi, beforeEach } from "vitest";

/** `?tree=1` merges two different answers to two different questions:
 * `team workspace --json` says what is in the workspace, `team files --json`
 * says what is supposed to be. The Files tab needs both — a required file that
 * is missing cannot appear in a listing of what exists, and everything the team
 * produced at runtime appears in no manifest.
 */

const runJigga = vi.fn();
const runJiggaJson = vi.fn();

vi.mock("@/lib/jigga-cli", () => ({
  runJigga: (args: string[]) => runJigga(args),
  runJiggaJson: (args: string[]) => runJiggaJson(args),
}));

const { GET } = await import("./route");

const WORKSPACE = {
  team: "mt",
  path: "/home/x/.jigga/workspaces/mt",
  files: [
    { name: "TEAM.md", bytes: 218, modified: "2026-08-17T00:00:00+00:00" },
    { name: "shared-context/memory/team.jsonl", bytes: 16, modified: "2026-08-17T00:01:00+00:00" },
    { name: "roles/lead/memory/2026-08-16.md", bytes: 90, modified: "2026-08-16T00:00:00+00:00" },
  ],
};

const MANIFEST = [
  { name: "TEAM.md", missing: false, required: true },
  { name: "notes/plan.md", missing: true, required: true },
  { name: "shared-context/priorities.md", missing: true, required: true },
];

function get(query: string) {
  return GET(new Request(`http://localhost/api/files${query}`));
}

/** The two CLI calls answer different questions; route by the verb. */
function wire(workspace: unknown = WORKSPACE, manifest: unknown = MANIFEST) {
  runJiggaJson.mockImplementation((args: string[]) =>
    args[1] === "workspace" ? Promise.resolve(workspace) : Promise.resolve(manifest),
  );
}

beforeEach(() => {
  runJigga.mockReset();
  runJiggaJson.mockReset();
  wire();
});

describe("GET ?tree=1", () => {
  it("returns files at every depth, not just the manifest's four", async () => {
    const body = (await (await get("?kind=team&id=mt&tree=1")).json()) as {
      files: { name: string }[];
    };
    const names = body.files.map((f) => f.name);
    // The two that motivated this: team memory and per-role dated memory.
    expect(names).toContain("shared-context/memory/team.jsonl");
    expect(names).toContain("roles/lead/memory/2026-08-16.md");
  });

  it("keeps size and mtime from the workspace listing", async () => {
    const body = (await (await get("?kind=team&id=mt&tree=1")).json()) as {
      files: { name: string; bytes?: number; modified?: string }[];
    };
    const entry = body.files.find((f) => f.name === "TEAM.md");
    expect(entry).toMatchObject({ bytes: 218, modified: "2026-08-17T00:00:00+00:00" });
  });

  it("still surfaces a required file that does not exist", async () => {
    const body = (await (await get("?kind=team&id=mt&tree=1")).json()) as {
      files: { name: string; missing: boolean; required?: boolean }[];
    };
    expect(body.files).toContainEqual({ name: "notes/plan.md", missing: true, required: true });
  });

  it("marks a present file as required without duplicating it", async () => {
    const body = (await (await get("?kind=team&id=mt&tree=1")).json()) as {
      files: { name: string; required?: boolean; missing: boolean }[];
    };
    const matches = body.files.filter((f) => f.name === "TEAM.md");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ required: true, missing: false });
  });

  it("still lists the workspace when the manifest call fails", async () => {
    // A missing manifest costs the required-file badges; it should not blank
    // out a workspace full of real files.
    runJiggaJson.mockImplementation((args: string[]) =>
      args[1] === "workspace" ? Promise.resolve(WORKSPACE) : Promise.reject(new Error("nope")),
    );
    const body = (await (await get("?kind=team&id=mt&tree=1")).json()) as { files: unknown[] };
    expect(body.files).toHaveLength(3);
  });

  it("rejects a flag-shaped id before shelling out", async () => {
    const res = await get("?kind=team&id=--home&tree=1");
    expect(res.status).toBe(400);
    expect(runJiggaJson).not.toHaveBeenCalled();
  });
});

describe("GET ?kind=agent&tree=1", () => {
  const AGENT_MANIFEST = [
    { name: "SOUL.md", missing: false, required: true },
    { name: "AGENTS.md", missing: true, required: true },
    { name: "TOOLS.md", missing: true, required: false },
  ];

  /** `roles/<agent>/` is the agent's own directory inside a workspace; anything
   * else in the listing belongs to the team or another member. */
  function wireAgent({ team = "mt", files = [
    { name: "roles/lead/SOUL.md", bytes: 364, modified: "2026-08-17T00:00:00+00:00" },
    { name: "roles/lead/memory/2026-08-16.md", bytes: 90, modified: "2026-08-16T00:00:00+00:00" },
    { name: "roles/other/SOUL.md", bytes: 12, modified: "2026-08-16T00:00:00+00:00" },
    { name: "TEAM.md", bytes: 218, modified: "2026-08-16T00:00:00+00:00" },
  ] } = {}) {
    runJiggaJson.mockImplementation((args: string[]) => {
      if (args[0] === "agents" && args[1] === "files") return Promise.resolve(AGENT_MANIFEST);
      if (args[1] === "list") return Promise.resolve([{ id: "lead", team }]);
      if (args[1] === "workspace") return Promise.resolve({ files });
      return Promise.resolve([]);
    });
  }

  it("shows the dated memory logs the manifest never mentions", async () => {
    wireAgent();
    const body = (await (await get("?kind=agent&id=lead&tree=1")).json()) as {
      files: { name: string }[];
    };
    // Agent-relative, because that is what `agents file get/set` takes.
    expect(body.files.map((f) => f.name)).toContain("memory/2026-08-16.md");
  });

  it("shows only that agent's files, not the team's or another member's", async () => {
    wireAgent();
    const body = (await (await get("?kind=agent&id=lead&tree=1")).json()) as {
      files: { name: string }[];
    };
    const names = body.files.map((f) => f.name);
    expect(names).not.toContain("TEAM.md");
    expect(names.some((n) => n.includes("other"))).toBe(false);
  });

  it("works for an agent with no team, which owns a workspace of its own", async () => {
    // `chief` has team: null and lives in workspaces/chief/roles/chief/.
    runJiggaJson.mockImplementation((args: string[]) => {
      if (args[0] === "agents" && args[1] === "files") return Promise.resolve(AGENT_MANIFEST);
      if (args[1] === "list") return Promise.resolve([{ id: "chief", team: null }]);
      if (args[1] === "workspace") {
        expect(args[2]).toBe("chief");   // the agent id IS the workspace id
        return Promise.resolve({ files: [{ name: "roles/chief/memory/2026-06-24.md", bytes: 40 }] });
      }
      return Promise.resolve([]);
    });
    const body = (await (await get("?kind=agent&id=chief&tree=1")).json()) as {
      files: { name: string }[];
    };
    expect(body.files.map((f) => f.name)).toContain("memory/2026-06-24.md");
  });

  it("still lists required-but-missing identity files", async () => {
    wireAgent();
    const body = (await (await get("?kind=agent&id=lead&tree=1")).json()) as {
      files: { name: string; missing: boolean; required?: boolean }[];
    };
    expect(body.files).toContainEqual({ name: "AGENTS.md", missing: true, required: true });
  });

  it("falls back to the manifest when no workspace is scaffolded yet", async () => {
    // A brand-new agent has a manifest and no directory; showing nothing at all
    // would read as "this agent has no files" rather than "not staffed yet".
    runJiggaJson.mockImplementation((args: string[]) => {
      if (args[0] === "agents" && args[1] === "files") return Promise.resolve(AGENT_MANIFEST);
      if (args[1] === "list") return Promise.resolve([{ id: "fresh", team: null }]);
      return Promise.reject(new Error("No workspace for 'fresh'"));
    });
    const body = (await (await get("?kind=agent&id=fresh&tree=1")).json()) as {
      files: { name: string }[];
    };
    const names = body.files.map((f) => f.name);
    expect(names).toContain("AGENTS.md");
    // The regression this shook out live: keeping only the MISSING manifest
    // entries dropped SOUL.md and MEMORY.md, so the tab lost files it used to
    // show whenever the workspace lookup failed.
    expect(names).toContain("SOUL.md");
  });
});
