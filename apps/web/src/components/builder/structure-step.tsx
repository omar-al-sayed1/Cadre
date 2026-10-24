"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/cn";
import { Input, Textarea } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import {
  blankSection,
  type BuilderDocument,
  type BuilderSection,
  type BuilderSkill,
} from "./types";

export function StructureStep({
  doc,
  setDoc,
  skills,
}: {
  doc: BuilderDocument;
  setDoc: (d: BuilderDocument) => void;
  skills: BuilderSkill[];
}) {
  const total = doc.sections.reduce((sum, s) => sum + s.targetDurationMinutes, 0);
  const update = (k: string, patch: Partial<BuilderSection>) =>
    setDoc({ ...doc, sections: doc.sections.map((s) => (s._key === k ? { ...s, ...patch } : s)) });
  const move = (index: number, dir: -1 | 1) => {
    const sections = [...doc.sections];
    const [moved] = sections.splice(index, 1);
    sections.splice(index + dir, 0, moved!);
    setDoc({ ...doc, sections });
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-4 py-3 text-sm">
        <span>
          Sections total <strong className="tabular-nums">{total} min</strong> of a{" "}
          <strong className="tabular-nums">{doc.durationMinutes} min</strong> interview
        </span>
        <span
          className={cn(
            "text-xs",
            Math.abs(total - doc.durationMinutes) > 3
              ? "text-warning-foreground"
              : "text-muted-foreground",
          )}
        >
          {Math.abs(total - doc.durationMinutes) > 3
            ? "Adjust section times to match the interview length"
            : "Timing looks balanced"}
        </span>
      </div>
      <ol className="space-y-3">
        {doc.sections.map((section, index) => (
          <li key={section._key} className="rounded-xl border bg-card p-4 shadow-xs">
            <div className="flex items-start gap-3">
              <span className="mt-2 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {index + 1}
              </span>
              <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_repeat(3,90px)]">
                <div className="grid gap-1.5">
                  <Label htmlFor={`name-${section._key}`}>Section name</Label>
                  <Input
                    id={`name-${section._key}`}
                    value={section.name}
                    onChange={(e) => update(section._key, { name: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`dur-${section._key}`}>Minutes</Label>
                  <Input
                    id={`dur-${section._key}`}
                    type="number"
                    min={1}
                    max={60}
                    value={section.targetDurationMinutes}
                    onChange={(e) =>
                      update(section._key, {
                        targetDurationMinutes: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`min-${section._key}`}>Min Qs</Label>
                  <Input
                    id={`min-${section._key}`}
                    type="number"
                    min={0}
                    max={20}
                    value={section.minQuestions}
                    onChange={(e) =>
                      update(section._key, {
                        minQuestions: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`max-${section._key}`}>Max Qs</Label>
                  <Input
                    id={`max-${section._key}`}
                    type="number"
                    min={1}
                    max={30}
                    value={section.maxQuestions}
                    onChange={(e) =>
                      update(section._key, {
                        maxQuestions: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                  />
                </div>
                <div className="grid gap-1.5 sm:col-span-4">
                  <Label htmlFor={`desc-${section._key}`}>Description (optional)</Label>
                  <Textarea
                    id={`desc-${section._key}`}
                    rows={2}
                    value={section.description ?? ""}
                    onChange={(e) => update(section._key, { description: e.target.value || null })}
                  />
                </div>
                {skills.length > 0 ? (
                  <fieldset className="sm:col-span-4">
                    <legend className="mb-1.5 text-sm font-medium">
                      Skills this section focuses on
                    </legend>
                    <div className="flex flex-wrap gap-1.5">
                      {skills.map((skill) => {
                        const active = section.focusSkillIds.includes(skill.id);
                        return (
                          <button
                            key={skill.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() =>
                              update(section._key, {
                                focusSkillIds: active
                                  ? section.focusSkillIds.filter((id) => id !== skill.id)
                                  : [...section.focusSkillIds, skill.id],
                              })
                            }
                            className={cn(
                              "rounded-full border px-3 py-1 text-xs transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                              active
                                ? "border-primary bg-primary/10 font-medium text-primary"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {skill.name}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ) : null}
              </div>
              <div className="flex flex-col">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move section up"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move section down"
                  disabled={index === doc.sections.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete section"
                  disabled={doc.sections.length === 1}
                  onClick={() =>
                    setDoc({
                      ...doc,
                      sections: doc.sections.filter((s) => s._key !== section._key),
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <Button
        type="button"
        variant="outline"
        onClick={() => setDoc({ ...doc, sections: [...doc.sections, blankSection()] })}
        disabled={doc.sections.length >= 15}
      >
        <Plus /> Add section
      </Button>
    </div>
  );
}
