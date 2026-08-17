"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { MemberTools, Skill, ToolGrant } from "@/app/api/teams/skills/route";

/** What this team can do, and where it stops.
 *
 * Grants are per agent and default to nothing, so this is a read of the
 * boundary rather than a place to edit it — changing what an agent may call
 * happens on that agent's page, one agent at a time, deliberately.
 */

const RISK_STYLE: Record<string, string> = {
  low: "bg-white/10 text-[color:var(--ck-text-secondary)]",
  medium: "bg-amber-500/20 text-amber-200",
  high: "bg-red-500/20 text-red-200",
};

const secondaryBtn =
  "rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-[color:var(--ck-text-secondary)] hover:bg-white/10";

function GrantRow({ grant }: { grant: ToolGrant }) {
  const risky = grant.risk_level && grant.risk_level !== "low";
  return (
    <li className="flex items-center justify-between gap-2 py-1">
      <span className="truncate font-mono text-xs text-[color:var(--ck-text-secondary)]">
        {grant.action}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {grant.status !== "ready" ? (
          <span
            className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-200"
            title={grant.reason ?? undefined}
          >
            {grant.status.replace(/_/g, " ")}
          </span>
        ) : null}
        {risky ? (
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${RISK_STYLE[grant.risk_level!] ?? RISK_STYLE.low}`}>
            {grant.risk_level}
          </span>
        ) : null}
      </span>
    </li>
  );
}

function MemberCard({ member, teamId }: { member: MemberTools; teamId: string }) {
  const needsApproval = member.tools.filter((t) => t.status !== "ready").length;
  const elevated = member.tools.filter((t) => t.risk_level && t.risk_level !== "low").length;
  return (
    <div className="ck-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{member.id}</div>
          <div className="mt-0.5 text-xs text-[color:var(--ck-text-tertiary)]">
            {member.tools.length} granted
            {elevated ? ` · ${elevated} elevated-risk` : ""}
            {needsApproval ? ` · ${needsApproval} needs approval` : ""}
          </div>
        </div>
        <Link
          href={`/agents/${encodeURIComponent(member.id)}?returnTo=/teams/${encodeURIComponent(teamId)}`}
          className={secondaryBtn + " shrink-0"}
        >
          Edit grants
        </Link>
      </div>
      {member.error ? (
        <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
          No agent yaml yet — this member is on the roster but not staffed.
        </div>
      ) : member.tools.length === 0 ? (
        <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
          No tools granted. It can still think and reply; it cannot act.
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-white/5">
          {member.tools.map((t) => (
            <GrantRow key={t.action} grant={t} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function SkillsTab({
  teamId,
  note,
}: {
  teamId: string;
  note: (msg: string, isError?: boolean) => void;
}) {
  const [members, setMembers] = useState<MemberTools[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [pendingSkills, setPendingSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);

  const noteRef = useRef(note);
  noteRef.current = note;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const out = await fetchJson<{
        members: MemberTools[]; skills: Skill[]; pendingSkills: Skill[];
      }>(`/api/teams/skills?teamId=${encodeURIComponent(teamId)}`);
      setMembers(out.members ?? []);
      setSkills(out.skills ?? []);
      setPendingSkills(out.pendingSkills ?? []);
    } catch (e) {
      noteRef.current(e instanceof Error ? e.message : String(e), true);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div className="mt-4 text-sm text-[color:var(--ck-text-tertiary)]">Loading grants…</div>;
  }

  const total = members.reduce((sum, m) => sum + m.tools.length, 0);

  return (
    <div className="mt-4 space-y-4">
      <div className="ck-card p-4">
        <div className="text-sm font-medium">What this team can do</div>
        <p className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
          {total} tool grant{total === 1 ? "" : "s"} across {members.length} member
          {members.length === 1 ? "" : "s"}. An agent may call only what it was granted — the
          default is nothing — so this is the team&apos;s whole reach. Grants are changed one
          agent at a time on the agent&apos;s page, where the boundary belongs.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {members.map((m) => (
          <MemberCard key={m.id} member={m} teamId={teamId} />
        ))}
      </div>

      <div className="ck-card p-4">
        <div className="text-sm font-medium">Skills</div>
        <p className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
          Skill packs are a global catalog — installed once, then granted to an agent like any
          other capability action.
        </p>
        {skills.length === 0 && pendingSkills.length === 0 ? (
          <p className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
            None installed. Create one with <span className="font-mono">jigga skills create</span>.
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-[color:var(--ck-text-secondary)]">
            {skills.map((s) => (
              <li key={s.name}>
                <span className="font-mono text-xs">{s.name}</span>
                {s.summary ? ` — ${s.summary}` : ""}
              </li>
            ))}
            {pendingSkills.map((s) => (
              <li key={`pending-${s.name}`} className="text-amber-200">
                <span className="font-mono text-xs">{s.name}</span> — awaiting approval
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
