"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, Check, ChevronsUpDown, LogOut, Menu, Plus, ShieldCheck } from "lucide-react";
import type { ProductKey } from "@repo/config";
import type { CompanyRole } from "@repo/shared";
import { roleHasPermission, ROLE_LABELS } from "@repo/core/permissions";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/dropdown-menu";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/misc";
import { Sheet, SheetContent, SheetTitle } from "@repo/ui/sheet";
import { api } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { formatRelative } from "@/lib/format";
import { BrandLogo, ThemeToggle } from "../brand";
import { FOOTER_NAV, PLATFORM_NAV, PRODUCT_NAV, type NavItem } from "./nav-items";

export interface ShellProps {
  user: { name: string; email: string; image: string | null; platformRole: string };
  company: { id: string; name: string; logoUrl: string | null };
  role: CompanyRole;
  companies: Array<{ id: string; name: string }>;
  notifications: {
    unread: number;
    items: Array<{
      id: string;
      title: string;
      body: string | null;
      link: string | null;
      createdAt: string;
      readAt: string | null;
    }>;
  };
  /** Products the workspace has subscribed to (any status), in catalogue order. */
  products: Array<{ key: ProductKey; name: string; active: boolean; trialDaysLeft: number | null }>;
  demoMode: boolean;
  children: React.ReactNode;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:inset-y-1.5 before:-left-3 before:w-0.5 before:rounded-r-full before:bg-primary"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
      )}
    >
      <item.icon className={cn("size-4 shrink-0", active && "text-primary")} aria-hidden="true" />
      {item.label}
    </Link>
  );
}

function SidebarNav({
  role,
  products,
  onNavigate,
}: {
  role: CompanyRole;
  products: ShellProps["products"];
  onNavigate?: () => void;
}) {
  const allowed = (item: NavItem) => !item.permission || roleHasPermission(role, item.permission);
  return (
    <nav
      aria-label="Main"
      className="-mx-3 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3"
    >
      <div className="flex flex-col gap-0.5">
        {PLATFORM_NAV.filter(allowed).map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </div>
      {products.map((product) => {
        const items = (PRODUCT_NAV[product.key] ?? []).filter(allowed);
        if (items.length === 0) return null;
        return (
          <div key={product.key} className="flex flex-col gap-0.5">
            <p className="flex items-center justify-between px-2.5 pb-1 text-[11px] font-medium tracking-[0.08em] text-muted-foreground/80 uppercase">
              {product.name}
              {!product.active ? (
                <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning-foreground normal-case">
                  Inactive
                </span>
              ) : product.trialDaysLeft !== null ? (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] normal-case">
                  Trial · {product.trialDaysLeft}d
                </span>
              ) : null}
            </p>
            {items.map((item) => (
              <NavLink key={item.href} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        );
      })}
      <div className="mt-auto flex flex-col gap-0.5">
        {FOOTER_NAV.filter(allowed).map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  );
}

function CompanySwitcher({
  company,
  companies,
  role,
}: Pick<ShellProps, "company" | "companies" | "role">) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2.5 rounded-lg border bg-background px-2.5 py-2 text-left text-sm hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
          <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-xs font-semibold">
            {company.logoUrl ? (
              <img src={company.logoUrl} alt="" className="size-full object-cover" />
            ) : (
              initials(company.name)
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{company.name}</span>
            <span className="block text-xs text-muted-foreground">{ROLE_LABELS[role]}</span>
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {companies.map((c) => (
          <DropdownMenuItem
            key={c.id}
            onSelect={async () => {
              if (c.id === company.id) return;
              await api("/api/companies/switch", { method: "POST", body: { companyId: c.id } });
              router.refresh();
            }}
          >
            <span className="flex-1 truncate">{c.name}</span>
            {c.id === company.id ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding?new=1">
            <Plus /> New workspace
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationsMenu({ notifications }: { notifications: ShellProps["notifications"] }) {
  const router = useRouter();
  const [unread, setUnread] = useState(notifications.unread);
  return (
    <Popover
      onOpenChange={async (open) => {
        if (!open && unread > 0) {
          setUnread(0);
          await api("/api/notifications", { method: "POST", body: {} }).catch(() => undefined);
          router.refresh();
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative"
          aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
        >
          <Bell />
          {unread > 0 ? (
            <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3 text-sm font-semibold">Notifications</div>
        {notifications.items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            You&apos;re all caught up.
          </p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {notifications.items.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.link ?? "#"}
                  className="flex gap-3 px-4 py-3 text-sm hover:bg-muted/60"
                >
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      n.readAt ? "bg-transparent" : "bg-primary",
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{n.title}</span>
                    {n.body ? (
                      <span className="block truncate text-muted-foreground">{n.body}</span>
                    ) : null}
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {formatRelative(n.createdAt)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function UserMenu({ user }: { user: ShellProps["user"] }) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="rounded-full focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label="Account menu"
        >
          <Avatar className="size-8">
            {user.image ? <AvatarImage src={user.image} alt="" /> : null}
            <AvatarFallback className="bg-primary/10 text-primary">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm font-medium text-foreground">{user.name}</span>
          <span className="block truncate">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.platformRole === "SUPER_ADMIN" ? (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <ShieldCheck /> Platform admin
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          variant="destructive"
          onSelect={async () => {
            await authClient.signOut();
            router.replace("/login");
            router.refresh();
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({
  user,
  company,
  role,
  companies,
  notifications,
  products,
  demoMode,
  children,
}: ShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-5 border-r bg-sidebar px-3 py-4 lg:flex">
        <div className="px-2">
          <BrandLogo href="/home" />
        </div>
        <CompanySwitcher company={company} companies={companies} role={role} />
        <SidebarNav role={role} products={products} />
        {demoMode ? (
          <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
            <strong className="font-semibold">Demo mode.</strong> AI features use deterministic
            local simulations — no paid APIs are called.
          </div>
        ) : null}
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 gap-5 bg-sidebar px-3 py-4">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="px-2">
            <BrandLogo href="/home" />
          </div>
          <CompanySwitcher company={company} companies={companies} role={role} />
          <SidebarNav role={role} products={products} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu />
          </Button>
          <div className="lg:hidden">
            <BrandLogo href="/home" compact />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <NotificationsMenu notifications={notifications} />
            <div className="ml-1">
              <UserMenu user={user} />
            </div>
          </div>
        </header>
        <main
          id="main-content"
          className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
