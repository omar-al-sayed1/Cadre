"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { LEAD_STATUS_META } from "@repo/sales-engine";
import { LEAD_STATUSES } from "@repo/shared";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";

const BANDS = [
  { value: "hot", label: "Hot" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "very_low", label: "Very low" },
  { value: "unscored", label: "Unscored" },
];

const SORTS = [
  { value: "score", label: "Best leads first" },
  { value: "newest", label: "Newest" },
  { value: "updated", label: "Recently updated" },
  { value: "name", label: "Name" },
];

/** Lead list filters in one row; state lives in the URL so views are shareable. */
export function LeadFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [, startTransition] = useTransition();

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  };

  useEffect(() => {
    const handle = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) setParam("q", q.trim() || null);
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasFilters = ["q", "status", "band"].some((k) => params.get(k));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          aria-label="Search leads"
          placeholder="Search name, company, email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-8"
        />
      </div>
      <Select value={params.get("status") ?? "all"} onValueChange={(v) => setParam("status", v)}>
        <SelectTrigger className="w-full sm:w-44" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {LEAD_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {LEAD_STATUS_META[s].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={params.get("band") ?? "all"} onValueChange={(v) => setParam("band", v)}>
        <SelectTrigger className="w-full sm:w-36" aria-label="Filter by score">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any score</SelectItem>
          {BANDS.map((b) => (
            <SelectItem key={b.value} value={b.value}>
              {b.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={params.get("sort") ?? "score"}
        onValueChange={(v) => setParam("sort", v === "score" ? null : v)}
      >
        <SelectTrigger className="w-full sm:w-44" aria-label="Sort leads">
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
      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            startTransition(() => router.replace(pathname));
          }}
        >
          <X /> Clear
        </Button>
      ) : null}
    </div>
  );
}
