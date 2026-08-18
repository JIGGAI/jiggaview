import type { ComponentType } from "react";
import { MemoryTab } from "./memory-tab";
import { WorkflowsTab } from "./workflows-tab";
import { SkillsTab } from "./skills-tab";

/** The team page's tabs, in order.
 *
 * Adding a tab used to mean editing three places in `team-editor.tsx` — the
 * `Tab` union, the button row, and a render branch — so every tab PR collided
 * with every other one in the same three lines (#18 vs #19 did exactly that).
 * Now a self-contained tab is one entry here.
 *
 * Tabs with no `Component` still render inside the editor: they read its local
 * state (the recipe buffer, the file being edited, the agent roster) and would
 * need that state threaded through props to move out. Their id, label and
 * ORDER live here regardless, which is what stops the collisions.
 */

export type TeamTabProps = {
  teamId: string;
  note: (message: string, isError?: boolean) => void;
};

export type TeamTab = {
  id: string;
  label: string;
  Component?: ComponentType<TeamTabProps>;
};

export const TEAM_TABS = [
  { id: "agents", label: "Agents" },
  { id: "recipe", label: "Recipe" },
  { id: "files", label: "Files" },
  { id: "memory", label: "Memory", Component: MemoryTab },
  { id: "workflows", label: "Workflows", Component: WorkflowsTab },
  { id: "skills", label: "Skills & tools", Component: SkillsTab },
  { id: "cron", label: "Cron" },
] as const satisfies readonly TeamTab[];

/** The tab ids, derived — so the union can never drift from the list. */
export type TeamTabId = (typeof TEAM_TABS)[number]["id"];

/** The same list, widened for rendering.
 *
 * `as const` is what makes the id union exact, but it also narrows each entry
 * to its own literal shape — so an entry without `Component` does not have the
 * property at all, and a `.map` over the tuple cannot read it. This view keeps
 * the exact ids for the type and a uniform shape for the loop.
 */
export const TEAM_TAB_LIST: readonly TeamTab[] = TEAM_TABS;

export const DEFAULT_TEAM_TAB: TeamTabId = "agents";

export function isTeamTabId(value: string): value is TeamTabId {
  return TEAM_TABS.some((tab) => tab.id === value);
}
