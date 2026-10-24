import {
  BarChart3,
  BookOpen,
  Briefcase,
  GitCompareArrows,
  Home,
  LayoutDashboard,
  Library,
  MessagesSquare,
  Settings,
  SlidersHorizontal,
  Store,
  Telescope,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ProductKey } from "@repo/config";
import type { Permission } from "@repo/core/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
  /** Match only the exact path (for section roots like /sales). */
  exact?: boolean;
}

/** Platform-level navigation, always visible. */
export const PLATFORM_NAV: NavItem[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/marketplace", label: "AI Marketplace", icon: Store },
];

/** Per-product navigation; a section shows only when the workspace subscribed. */
export const PRODUCT_NAV: Partial<Record<ProductKey, NavItem[]>> = {
  interviewer: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "job.read" },
    { href: "/jobs", label: "Jobs", icon: Briefcase, permission: "job.read" },
    { href: "/interviews", label: "Interviews", icon: MessagesSquare, permission: "results.read" },
    { href: "/candidates", label: "Candidates", icon: Users, permission: "candidate.read" },
    { href: "/compare", label: "Compare", icon: GitCompareArrows, permission: "results.read" },
    { href: "/analytics", label: "Analytics", icon: BarChart3, permission: "analytics.read" },
    { href: "/question-bank", label: "Question bank", icon: Library, permission: "template.read" },
  ],
  "sales-agent": [
    {
      href: "/sales",
      label: "Dashboard",
      icon: LayoutDashboard,
      permission: "sales.read",
      exact: true,
    },
    { href: "/sales/leads", label: "Leads", icon: Users, permission: "sales.read" },
    { href: "/sales/discover", label: "Find leads", icon: Telescope, permission: "sales.read" },
    { href: "/sales/playbook", label: "Playbook", icon: BookOpen, permission: "sales.read" },
    {
      href: "/sales/settings",
      label: "Agent settings",
      icon: SlidersHorizontal,
      permission: "sales.read",
    },
  ],
};

export const FOOTER_NAV: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings, permission: "company.read" },
];
