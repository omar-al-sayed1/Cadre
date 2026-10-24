"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { CANDIDATE_STAGES, RECOMMENDATIONS } from "@repo/shared";
import { RECOMMENDATION_META } from "@repo/scoring";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { STAGE_LABELS } from "@/lib/format";

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "score_desc", label: "Score: high to low" },
  { value: "score_asc", label: "Score: low to high" },
  { value: "name", label: "Name" },
];

/** Filters in one row above the table; state lives in the URL so views are shareable. */
export function CandidateFilters({ jobs }: { jobs?: Array<{ id: string; title: string }> }) {
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

  const hasFilters = ["q", "stage", "recommendation", "jobId", "minScore"].some((k) =>
    params.get(k),
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          aria-label="Search candidates by name or email"
          placeholder="Search name or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-8"
        />
      </div>
      {jobs ? (
        <Select value={params.get("jobId") ?? "all"} onValueChange={(v) => setParam("jobId", v)}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Filter by job">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All jobs</SelectItem>
            {jobs.map((j) => (
              <SelectItem key={j.id} value={j.id}>
                {j.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <Select value={params.get("stage") ?? "all"} onValueChange={(v) => setParam("stage", v)}>
        <SelectTrigger className="w-full sm:w-40" aria-label="Filter by stage">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All stages</SelectItem>
          {CANDIDATE_STAGES.map((s) => (
            <SelectItem key={s} value={s}>
              {STAGE_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={params.get("recommendation") ?? "all"}
        onValueChange={(v) => setParam("recommendation", v)}
      >
        <SelectTrigger className="w-full sm:w-48" aria-label="Filter by recommendation">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any recommendation</SelectItem>
          {RECOMMENDATIONS.map((r) => (
            <SelectItem key={r} value={r}>
              {RECOMMENDATION_META[r].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={params.get("minScore") ?? "all"}
        onValueChange={(v) => setParam("minScore", v)}
      >
        <SelectTrigger className="w-full sm:w-36" aria-label="Minimum score">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any score</SelectItem>
          {[40, 60, 70, 80].map((s) => (
            <SelectItem key={s} value={String(s)}>
              {s}+
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={params.get("sort") ?? "newest"} onValueChange={(v) => setParam("sort", v)}>
        <SelectTrigger className="w-full sm:w-44" aria-label="Sort">
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
