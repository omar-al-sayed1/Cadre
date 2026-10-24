"use client";

import Link from "next/link";
import { Monitor, Moon, Sun } from "lucide-react";
import { brand } from "@repo/config";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/cn";
import { useHydrated } from "@/hooks/use-latest";
import { useTheme, type ThemePreference } from "./theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@repo/ui/dropdown-menu";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm",
        className,
      )}
      aria-hidden="true"
    >
      {/* Cadre: a small team (three members) forming one unit. */}
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="currentColor">
        <circle cx="12" cy="6.5" r="3" />
        <circle cx="6" cy="16.5" r="3" opacity="0.75" />
        <circle cx="18" cy="16.5" r="3" opacity="0.75" />
        <path
          d="M12 9.5 6 16.5M12 9.5l6 7M6 16.5h12"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
          opacity="0.55"
        />
      </svg>
    </span>
  );
}

export function BrandLogo({
  href = "/",
  className,
  compact = false,
}: {
  href?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-md font-semibold tracking-tight focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        className,
      )}
    >
      <LogoMark />
      {compact ? (
        <span className="sr-only">{brand.productName}</span>
      ) : (
        <span className="text-[15px]">{brand.productName}</span>
      )}
    </Link>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = useHydrated();
  const Icon = !mounted ? Monitor : resolvedTheme === "dark" ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className={className} aria-label="Change theme">
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={theme ?? "system"}
          onValueChange={(value) => setTheme(value as ThemePreference)}
        >
          <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
