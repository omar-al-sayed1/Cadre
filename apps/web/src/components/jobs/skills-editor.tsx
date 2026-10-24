"use client";

import { Plus, Scale, Star, Trash2 } from "lucide-react";
import { SKILL_LEVELS, type SkillLevel } from "@repo/shared";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/cn";
import { Input } from "@repo/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { humanize } from "@/lib/format";

export interface SkillRow {
  key: string;
  skillId?: string;
  name: string;
  weight: number;
  expectedLevel: SkillLevel;
  isCritical: boolean;
}

export function newSkillRow(name = "", weight = 0): SkillRow {
  return {
    key: Math.random().toString(36).slice(2),
    name,
    weight,
    expectedLevel: "INTERMEDIATE",
    isCritical: false,
  };
}

/** Distribute 100% across skills evenly, preserving order (remainder goes to the first rows). */
export function balanceWeights(rows: SkillRow[]): SkillRow[] {
  if (rows.length === 0) return rows;
  const base = Math.floor(100 / rows.length);
  let remainder = 100 - base * rows.length;
  return rows.map((row) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { ...row, weight: base + extra };
  });
}

export function SkillsEditor({
  rows,
  onChange,
  error,
}: {
  rows: SkillRow[];
  onChange: (rows: SkillRow[]) => void;
  error?: string;
}) {
  const total = rows.reduce((sum, r) => sum + (Number.isFinite(r.weight) ? r.weight : 0), 0);
  const update = (key: string, patch: Partial<SkillRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-3">
      <div className="hidden grid-cols-[1fr_96px_150px_40px_40px] gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid">
        <span>Skill</span>
        <span>Weight %</span>
        <span>Expected level</span>
        <span className="text-center">Critical</span>
        <span />
      </div>
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li
            key={row.key}
            className="grid grid-cols-[1fr_80px] gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_96px_150px_40px_40px] sm:border-0 sm:p-0"
          >
            <Input
              aria-label={`Skill ${index + 1} name`}
              placeholder="e.g. Java"
              value={row.name}
              onChange={(e) => update(row.key, { name: e.target.value, skillId: undefined })}
            />
            <Input
              aria-label={`${row.name || `Skill ${index + 1}`} weight`}
              type="number"
              min={0}
              max={100}
              inputMode="numeric"
              value={Number.isFinite(row.weight) ? row.weight : ""}
              onChange={(e) =>
                update(row.key, { weight: Number.parseInt(e.target.value || "0", 10) })
              }
            />
            <Select
              value={row.expectedLevel}
              onValueChange={(v) => update(row.key, { expectedLevel: v as SkillLevel })}
            >
              <SelectTrigger aria-label={`${row.name || `Skill ${index + 1}`} expected level`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SKILL_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {humanize(level)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-pressed={row.isCritical}
              aria-label={`Mark ${row.name || "skill"} as critical`}
              title="Critical skills cap the recommendation when clearly weak"
              onClick={() => update(row.key, { isCritical: !row.isCritical })}
            >
              <Star className={cn(row.isCritical && "fill-warning text-warning")} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove ${row.name || "skill"}`}
              onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange([...rows, newSkillRow()])}
            disabled={rows.length >= 25}
          >
            <Plus /> Add skill
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(balanceWeights(rows))}
            disabled={rows.length === 0}
          >
            <Scale /> Balance weights
          </Button>
        </div>
        <span
          className={cn(
            "text-sm font-medium tabular-nums",
            rows.length > 0 && total !== 100 ? "text-destructive" : "text-muted-foreground",
          )}
          aria-live="polite"
        >
          Total: {total}%{rows.length > 0 && total !== 100 ? " — must equal 100%" : ""}
        </span>
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
