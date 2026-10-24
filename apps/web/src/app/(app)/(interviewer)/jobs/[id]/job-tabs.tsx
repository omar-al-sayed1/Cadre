"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@repo/ui/cn";

export function JobTabs({ jobId }: { jobId: string }) {
  const pathname = usePathname();
  const base = `/jobs/${jobId}`;
  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/candidates`, label: "Candidates" },
    { href: `${base}/interview`, label: "Interview" },
    { href: `${base}/analytics`, label: "Analytics" },
    { href: `${base}/settings`, label: "Settings" },
  ];
  return (
    <nav
      aria-label="Job sections"
      className="scrollbar-none flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-border)]"
    >
      {tabs.map((tab) => {
        const active = tab.href === base ? pathname === base : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 px-3 pb-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
