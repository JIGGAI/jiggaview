"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/ToastProvider";

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid size-7 place-items-center text-[color:var(--ck-text-secondary)]" aria-hidden>
      {children}
    </span>
  );
}

function SideNavLink({
  href,
  label,
  icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={label}
      className={
        "mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
        (active
          ? "bg-white/10 text-[color:var(--ck-text-primary)]"
          : "text-[color:var(--ck-text-secondary)] hover:bg-white/5 hover:text-[color:var(--ck-text-primary)]") +
        (collapsed ? " justify-center px-2" : "")
      }
    >
      {icon}
      {collapsed ? null : <span>{label}</span>}
    </Link>
  );
}

const NAV = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <Icon>
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 11l9-8 9 8" />
          <path d="M5 10v10h14V10" />
        </svg>
      </Icon>
    ),
  },
  {
    href: "/agents",
    label: "Agents",
    icon: (
      <Icon>
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
        </svg>
      </Icon>
    ),
  },
  {
    href: "/recipes",
    label: "Recipes",
    icon: (
      <Icon>
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 4h12v16H6z" />
          <path d="M9 8h6" />
          <path d="M9 12h6" />
        </svg>
      </Icon>
    ),
  },
  {
    href: "/tasks",
    label: "Tasks",
    icon: (
      <Icon>
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 7h16v4a2 2 0 0 1 0 4v4H4v-4a2 2 0 0 0 0-4z" />
        </svg>
      </Icon>
    ),
  },
  {
    href: "/runs",
    label: "Runs",
    icon: (
      <Icon>
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19h16" />
          <path d="M6 16l4-4 3 3 5-7" />
        </svg>
      </Icon>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <Icon>
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
          <path d="M19.4 15a7.9 7.9 0 0 0 .1-1l2-1.5-2-3.5-2.4.5a7.8 7.8 0 0 0-1.7-1L13.5 3h-4L8.6 6.5a7.8 7.8 0 0 0-1.7 1L4.5 7l-2 3.5 2 1.5a7.9 7.9 0 0 0 .1 1l-2 1.5 2 3.5 2.4-.5a7.8 7.8 0 0 0 1.7 1L10.5 21h4l.9-3.5a7.8 7.8 0 0 0 1.7-1l2.4.5 2-3.5-2-1.5Z" />
        </svg>
      </Icon>
    ),
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [collapsed, setCollapsed] = useState(false);

  return (
    <ToastProvider>
      <div className="flex h-dvh bg-[color:var(--ck-bg-primary)] text-[color:var(--ck-text-primary)]">
        <aside
          className={
            "flex shrink-0 flex-col border-r border-[color:var(--ck-border-subtle)] bg-[color:var(--ck-bg-secondary)] " +
            (collapsed ? "w-16" : "w-62")
          }
        >
          <div className="flex items-center justify-between gap-2 border-b border-[color:var(--ck-border-subtle)] p-3">
            {collapsed ? null : (
              <Link href="/" className="text-sm font-semibold tracking-tight" title="Home">
                JIGGAVIEW
              </Link>
            )}
            <button
              className="rounded-lg px-2 py-1 text-sm text-[color:var(--ck-text-secondary)] hover:bg-white/5"
              onClick={() => setCollapsed((v) => !v)}
              title={collapsed ? "Expand" : "Collapse"}
            >
              {collapsed ? "»" : "«"}
            </button>
          </div>

          <nav className="min-h-0 flex-1 overflow-auto p-2">
            {NAV.map((it) => (
              <SideNavLink
                key={it.href}
                href={it.href}
                label={it.label}
                icon={it.icon}
                collapsed={collapsed}
                active={it.href === "/" ? pathname === "/" : pathname.startsWith(it.href)}
              />
            ))}
          </nav>

          <div className="flex items-center justify-between gap-2 border-t border-[color:var(--ck-border-subtle)] p-2">
            <a
              href="https://github.com/JIGGAI/jiggaview"
              target="_blank"
              rel="noreferrer"
              className={
                collapsed
                  ? "mx-auto rounded-lg px-2 py-2 text-sm text-[color:var(--ck-text-secondary)] hover:bg-white/5"
                  : "rounded-lg px-3 py-2 text-sm font-medium text-[color:var(--ck-text-secondary)] hover:bg-white/5 hover:text-[color:var(--ck-text-primary)]"
              }
              title="GitHub"
            >
              {collapsed ? "↗" : "GitHub"}
            </a>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <main className="h-full overflow-auto px-6 py-5 lg:px-10">
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
