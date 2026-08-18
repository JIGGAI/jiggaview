import { describe, expect, it } from "vitest";
import { DEFAULT_TEAM_TAB, TEAM_TABS, TEAM_TAB_LIST, isTeamTabId } from "./team-tabs";

/** The registry exists so adding a tab is one entry in one file.
 *
 * It used to be three edits inside team-editor.tsx — the `Tab` union, the
 * button row, and a render branch — which is why #18 (Workflows) and #19
 * (Skills) collided in exactly those lines.
 */

describe("the team tab registry", () => {
  it("has unique ids", () => {
    const ids = TEAM_TAB_LIST.map((tab) => tab.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every tab a label", () => {
    expect(TEAM_TAB_LIST.every((tab) => tab.label.trim().length > 0)).toBe(true);
  });

  it("starts on a tab that exists", () => {
    expect(isTeamTabId(DEFAULT_TEAM_TAB)).toBe(true);
  });

  it("keeps the order it declares", () => {
    // The order IS the UI; a set would lose it.
    expect(TEAM_TAB_LIST.map((t) => t.id)).toEqual([
      "agents", "recipe", "files", "memory", "workflows", "skills", "deliverables", "cron",
    ]);
  });

  it("rejects an unknown id", () => {
    expect(isTeamTabId("nope")).toBe(false);
  });

  it("renders self-contained tabs from the registry, not from the editor", () => {
    // These three carry their own component; the rest still read the editor's
    // local state and render there. That split is the honest current state.
    const withComponent = TEAM_TAB_LIST.filter((t) => t.Component).map((t) => t.id);
    expect(withComponent).toEqual(["memory", "workflows", "skills", "deliverables"]);
  });

  it("exposes the same entries through both views", () => {
    // TEAM_TABS keeps exact ids for the union; TEAM_TAB_LIST is the widened
    // view used for rendering. They must not drift.
    expect(TEAM_TAB_LIST.map((t) => t.id)).toEqual(TEAM_TABS.map((t) => t.id));
  });
});
