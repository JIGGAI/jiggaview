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

  it("ignores tree=1 for agents, which have no workspace listing", async () => {
    await get("?kind=agent&id=lead&tree=1");
    expect(runJiggaJson).toHaveBeenCalledWith(["agents", "files", "lead", "--json"]);
  });

  it("rejects a flag-shaped id before shelling out", async () => {
    const res = await get("?kind=team&id=--home&tree=1");
    expect(res.status).toBe(400);
    expect(runJiggaJson).not.toHaveBeenCalled();
  });
});
