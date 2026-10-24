"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Columns3, List, Loader2, Search, X } from "lucide-react";
import { cn } from "@repo/ui/cn";
import { Input } from "@repo/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";

const BANDS = [
  { value: "hot", label: "Hot" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "unscored", label: "Unscored" },
];

const SORTS = [
  { value: "score", label: "Best first" },
  { value: "newest", label: "Newest" },
  { value: "updated", label: "Recently active" },
  { value: "name", label: "A–Z" },
];

/** Search, score-band chips, sort and list/board switch. State lives in the URL. */
export function LeadsToolbar({ bandCounts }: { bandCounts: Record<string, number> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, startTransition] = useTransition();
  const view = params.get("view") === "board" ? "board" : "list";
  const band = params.get("band");

  const setParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value && value !== "all") next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  useEffect(() => {
    const handle = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) setParams({ q: q.trim() || null });
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-72">
        {pending ? (
          <Loader2
            className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        ) : (
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
        )}
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, company, email…"
          aria-label="Search leads"
          className="h-8 pl-8 text-[13px]"
        />
        {q ? (
          <button
            type="button"
            onClick={() => setQ("")}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <div role="group" aria-label="Filter by score" className="flex flex-wrap items-center gap-1">
        {BANDS.map((b) => {
          const on = band === b.value;
          return (
            <button
              key={b.value}
              type="button"
              aria-pressed={on}
              onClick={() => setParams({ band: on ? null : b.value })}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors",
                on
                  ? "border-foreground bg-foreground text-background"
                  : "text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              {b.label}
              <span className={cn("tabular-nums", on ? "opacity-70" : "text-muted-foreground/70")}>
                {bandCounts[b.value] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Select
          value={params.get("sort") ?? "score"}
          onValueChange={(v) => setParams({ sort: v === "score" ? null : v })}
        >
          <SelectTrigger size="sm" className="h-8 w-40 text-[13px]" aria-label="Sort leads">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div role="radiogroup" aria-label="View" className="flex rounded-lg border p-0.5">
          {(
            [
              ["list", "List", List],
              ["board", "Board", Columns3],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={view === value}
              aria-label={`${label} view`}
              title={`${label} view`}
              onClick={() => setParams({ view: value === "list" ? null : value })}
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-md transition-colors",
                view === value
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
