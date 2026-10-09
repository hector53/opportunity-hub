"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, FlaskConical, Home, Inbox, KanbanSquare, PlugZap, Settings } from "lucide-react";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/opportunities", label: "Opportunities", icon: Briefcase },
  { href: "/applications", label: "Applications", icon: KanbanSquare },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/experiments", label: "Experiments", icon: FlaskConical },
  { href: "/sources", label: "Sources", icon: PlugZap },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function NavLinks({ counts }: { counts?: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Principal">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        const count = counts?.[href];
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
              active ? "bg-accent-soft text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Icon size={16} className={active ? "text-accent" : ""} />
            <span className="flex-1">{label}</span>
            {count ? <span className="rounded bg-surface-3 px-1.5 text-[11px] tabular-nums text-muted">{count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
