import { describe, expect, it, vi, beforeEach } from "vitest";

/** Deleting is the one action here that destroys work.
 *
 * The route's job is to be honest about scope BEFORE the click: deleting a team
 * also removes the agents and workflows its install record owns, so someone
 * expecting to lose one yaml can lose four agents. The preview is what puts
 * that on screen, and it comes from the same record core reads — a hand-written
 * guess would drift from what actually happens.
 */

const runJigga = vi.fn();
const runJiggaJson = vi.fn();
vi.mock("@/lib/jigga-cli", () => ({
  runJigga: (args: string[]) => runJigga(args),
  runJiggaJson: (args: string[]) => runJiggaJson(args),
}));

const { GET, POST } = await import("./route");

const RECORDS = [
  { scaffold_id: "mt", kind: "team", artifacts: [
    "agents/mt-lead.yaml", "agents/mt-writer.yaml",
    "teams/mt.yaml", "workflows/mt_launch.yaml"] },
  { scaffold_id: "solo", kind: "agent", artifacts: ["agents/solo.yaml"] },
];

const ok = (stdout = "{}") => ({ ok: true, exitCode: 0, stdout, stderr: "" });

const get = (query: string) => GET(new Request(`https://x/api/delete?${query}`));
const post = (body: unknown) =>
  POST(new Request("https://x/api/delete", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  runJigga.mockReset();
  runJiggaJson.mockReset();
  runJigga.mockResolvedValue(ok());
  runJiggaJson.mockResolvedValue(RECORDS);
});

describe("preview", () => {
  it("names the agents and workflows a team delete takes with it", async () => {
    const body = await (await get("kind=team&id=mt")).json();
    expect(body.agents).toEqual(["mt-lead", "mt-writer"]);
    expect(body.workflows).toEqual(["mt_launch"]);
    expect(body.removes).toContain("teams/mt.yaml");
    expect(body.removes).toContain("workspaces/mt");
  });

  it("does not list the team's own yaml twice", async () => {
    const body = await (await get("kind=team&id=mt")).json();
    expect(body.removes.filter((p: string) => p === "teams/mt.yaml")).toHaveLength(1);
  });

  it("treats a team with no install record as yaml plus workspace", async () => {
    // A hand-made team owns nothing; claiming otherwise would scare someone out
    // of a safe delete.
    const body = await (await get("kind=team&id=handmade")).json();
    expect(body.agents).toEqual([]);
    expect(body.removes).toEqual(["teams/handmade.yaml", "workspaces/handmade"]);
  });

  it("survives a failing records lookup rather than claiming nothing is owned", async () => {
    runJiggaJson.mockRejectedValue(new Error("no recipes"));
    const body = await (await get("kind=team&id=mt")).json();
    expect(body.removes).toContain("teams/mt.yaml");
  });

  it("an agent preview does not consult install records at all", async () => {
    const body = await (await get("kind=agent&id=writer")).json();
    expect(body.removes).toEqual(["agents/writer.yaml", "workspaces/*/roles/writer"]);
    expect(runJiggaJson).not.toHaveBeenCalled();
  });

  it("rejects an unknown kind and a flag-shaped id", async () => {
    expect((await get("kind=database&id=x")).status).toBe(400);
    expect((await get("kind=agent&id=--home")).status).toBe(400);
  });
});

describe("delete", () => {
  it("calls the right command per kind", async () => {
    await post({ kind: "agent", id: "writer" });
    expect(runJigga).toHaveBeenCalledWith(["agents", "delete", "writer", "--json"]);
    await post({ kind: "team", id: "mt" });
    expect(runJigga).toHaveBeenCalledWith(["team", "delete", "mt", "--json"]);
  });

  it("refuses a flag-shaped id before shelling out", async () => {
    expect((await post({ kind: "agent", id: "--home" })).status).toBe(400);
    expect(runJigga).not.toHaveBeenCalled();
  });

  it("refuses an unknown kind", async () => {
    expect((await post({ kind: "workflow", id: "x" })).status).toBe(400);
    expect(runJigga).not.toHaveBeenCalled();
  });

  it("surfaces core's refusal instead of a generic failure", async () => {
    runJigga.mockResolvedValue({ ok: false, exitCode: 1, stdout: "", stderr: "No such agent: 'ghost'" });
    const res = await post({ kind: "agent", id: "ghost" });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("No such agent");
  });

  it("returns core's result, which lists what was removed and backed up", async () => {
    runJigga.mockResolvedValue(ok(JSON.stringify({ agent: "writer", backups: ["state/backups/x"] })));
    expect(await (await post({ kind: "agent", id: "writer" })).json())
      .toMatchObject({ agent: "writer" });
  });
});
