"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@repo/ui/cn";

interface Item {
  href: string;
  label: string;
}

const WORKSPACE: Item[] = [
  { href: "/settings/company", label: "Company & branding" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/billing", label: "Subscriptions & usage" },
];

const INTERVIEWER: Item[] = [
  { href: "/settings/interview", label: "Interview & AI" },
  { href: "/settings/privacy", label: "Privacy & retention" },
  { href: "/settings/notifications", label: "Notifications" },
];

const SALES: Item[] = [
  { href: "/settings/sales", label: "Sales agent" },
  { href: "/settings/sales/playbook", label: "Sales playbook" },
];

/**
 * Settings navigation. Product settings appear only for products the workspace
 * subscribes to: interviewer settings for the AI Interviewer, sales settings for
 * the AI Sales Agent, both when it has both.
 */
export function SettingsNav({ products }: { products: { interviewer: boolean; sales: boolean } }) {
  const pathname = usePathname();
  const groups: Array<{ label: string; items: Item[] }> = [
    { label: "Workspace", items: WORKSPACE },
    ...(products.interviewer ? [{ label: "AI Interviewer", items: INTERVIEWER }] : []),
    ...(products.sales ? [{ label: "AI Sales Agent", items: SALES }] : []),
  ];
  return (
    <nav
      aria-label="Settings"
      className="scrollbar-none flex gap-1 overflow-x-auto lg:flex-col lg:gap-4"
    >
      {groups.map((group) => (
        <div key={group.label} className="flex gap-1 lg:flex-col">
          <p className="hidden px-3 pt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase lg:block">
            {group.label}
          </p>
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-2 text-sm whitespace-nowrap",
                pathname === item.href
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
