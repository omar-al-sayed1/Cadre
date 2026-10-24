"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Library, Plus, Sparkles, Trash2 } from "lucide-react";
import {
  QUESTION_DIFFICULTIES,
  QUESTION_TYPES,
  type QuestionDifficulty,
  type QuestionType,
} from "@repo/shared";
import type { QuestionData } from "@repo/validation";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/dialog";
import { Input, Textarea } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Switch } from "@repo/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { toast } from "@repo/ui/sonner";
import { api, ApiError } from "@/lib/api-client";
import { DIFFICULTY_LABELS, QUESTION_TYPE_LABELS } from "@/lib/format";
import {
  blankQuestion,
  key,
  type BuilderDocument,
  type BuilderQuestion,
  type BuilderSection,
  type BuilderSkill,
} from "./types";

const listToText = (list: string[]) => list.join(", ");
const textToList = (text: string) =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

function QuestionCard({
  question,
  index,
  total,
  skills,
  onChange,
  onRemove,
  onMove,
  onRegenerate,
}: {
  question: BuilderQuestion;
  index: number;
  total: number;
  skills: BuilderSkill[];
  onChange: (q: BuilderQuestion) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onRegenerate: () => Promise<void>;
}) {
  const [open, setOpen] = useState(question.text === "");
  const [regenerating, setRegenerating] = useState(false);
  const set = <K extends keyof BuilderQuestion>(k: K, v: BuilderQuestion[K]) =>
    onChange({ ...question, [k]: v });
  const id = question._key;
  return (
    <li className="rounded-lg border bg-background">
      <div className="flex items-start gap-2 p-3">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium tabular-nums">
          {index + 1}
        </span>
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={`q-${id}`}
        >
          <span className={cn("block text-sm", !question.text && "text-muted-foreground italic")}>
            {question.text || "Untitled question"}
          </span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge variant="muted">{QUESTION_TYPE_LABELS[question.type]}</Badge>
            <Badge variant="outline">{DIFFICULTY_LABELS[question.difficulty]}</Badge>
            {question.skillId ? (
              <Badge variant="info">
                {skills.find((s) => s.id === question.skillId)?.name ?? "Skill"}
              </Badge>
            ) : null}
            {question.mandatory ? <Badge variant="warning">Mandatory</Badge> : null}
            {question.source === "AI_GENERATED" ? (
              <Badge variant="secondary">
                <Sparkles /> AI
              </Badge>
            ) : null}
          </span>
        </button>
        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Move question up"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Move question down"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={open ? "Collapse question" : "Edit question"}
            onClick={() => setOpen(!open)}
          >
            <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
          </Button>
        </div>
      </div>
      {open ? (
        <div id={`q-${id}`} className="grid gap-3 border-t p-3 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor={`text-${id}`}>Question</Label>
            <Textarea
              id={`text-${id}`}
              rows={2}
              value={question.text}
              onChange={(e) => set("text", e.target.value)}
              placeholder="What would you like the AI to ask?"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`type-${id}`}>Type</Label>
            <Select value={question.type} onValueChange={(v) => set("type", v as QuestionType)}>
              <SelectTrigger id={`type-${id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUESTION_TYPES.filter((t) => t !== "FOLLOW_UP").map((t) => (
                  <SelectItem key={t} value={t}>
                    {QUESTION_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`diff-${id}`}>Difficulty</Label>
            <Select
              value={question.difficulty}
              onValueChange={(v) => set("difficulty", v as QuestionDifficulty)}
            >
              <SelectTrigger id={`diff-${id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUESTION_DIFFICULTIES.map((d) => (
                  <SelectItem key={d} value={d}>
                    {DIFFICULTY_LABELS[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`skill-${id}`}>Skill assessed</Label>
            <Select
              value={question.skillId ?? "none"}
              onValueChange={(v) => set("skillId", v === "none" ? null : v)}
            >
              <SelectTrigger id={`skill-${id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">General (no specific skill)</SelectItem>
                {skills.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-3 pb-1.5">
            <Switch
              id={`mand-${id}`}
              checked={question.mandatory}
              onCheckedChange={(v) => set("mandatory", v)}
            />
            <Label htmlFor={`mand-${id}`}>Always ask (mandatory)</Label>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor={`topics-${id}`}>Expected topics</Label>
            <Input
              id={`topics-${id}`}
              value={listToText(question.expectedTopics)}
              onChange={(e) => set("expectedTopics", textToList(e.target.value))}
              placeholder="Comma-separated concepts a good answer covers"
            />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor={`ideal-${id}`}>Ideal answer (private)</Label>
            <Textarea
              id={`ideal-${id}`}
              rows={2}
              value={question.idealAnswer ?? ""}
              onChange={(e) => set("idealAnswer", e.target.value || null)}
              placeholder="Never shown to candidates. Guides evaluation."
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`flags-${id}`}>Red flags</Label>
            <Input
              id={`flags-${id}`}
              value={listToText(question.redFlags)}
              onChange={(e) => set("redFlags", textToList(e.target.value))}
              placeholder="Comma-separated"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`fu-${id}`}>Follow-up guidance</Label>
            <Input
              id={`fu-${id}`}
              value={question.followUpGuidance ?? ""}
              onChange={(e) => set("followUpGuidance", e.target.value || null)}
              placeholder="What to probe if the answer is incomplete"
            />
          </div>
          <div className="flex justify-between gap-2 sm:col-span-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={regenerating}
              onClick={async () => {
                setRegenerating(true);
                await onRegenerate();
                setRegenerating(false);
              }}
            >
              <Sparkles /> Regenerate with AI
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={onRemove}
            >
              <Trash2 /> Delete
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

interface BankItem {
  id: string;
  text: string;
  type: QuestionType;
  difficulty: QuestionDifficulty;
  skillId: string | null;
  expectedTopics: string[];
  idealAnswer: string | null;
  redFlags: string[];
  followUpGuidance: string | null;
  weight: number;
  tags: string[];
}

function BankPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (q: BankItem) => void;
}) {
  const [items, setItems] = useState<BankItem[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open || items !== null) return;
    let cancelled = false;
    api<{ items: BankItem[] }>("/api/question-bank")
      .then((r) => !cancelled && setItems(r.items))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [open, items]);
  const filtered = (items ?? []).filter(
    (i) =>
      !q ||
      i.text.toLowerCase().includes(q.toLowerCase()) ||
      i.tags.some((t) => t.toLowerCase().includes(q.toLowerCase())),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add from question bank</DialogTitle>
          <DialogDescription>Reuse questions your team has saved.</DialogDescription>
        </DialogHeader>
        <Input
          aria-label="Search question bank"
          placeholder="Search questions or tags"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <ul className="max-h-96 divide-y overflow-y-auto rounded-lg border">
          {items === null ? <li className="p-4 text-sm text-muted-foreground">Loading…</li> : null}
          {items !== null && filtered.length === 0 ? (
            <li className="p-4 text-sm text-muted-foreground">No matching questions.</li>
          ) : null}
          {filtered.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0 text-sm">
                <p>{item.text}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {QUESTION_TYPE_LABELS[item.type]} · {DIFFICULTY_LABELS[item.difficulty]}
                  {item.tags.length ? ` · ${item.tags.join(", ")}` : ""}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => onPick(item)}>
                Add
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function QuestionsStep({
  doc,
  setDoc,
  skills,
  jobId,
}: {
  doc: BuilderDocument;
  setDoc: (d: BuilderDocument) => void;
  skills: BuilderSkill[];
  jobId: string;
}) {
  const [bankFor, setBankFor] = useState<string | null>(null);
  const updateSection = (sectionKey: string, fn: (s: BuilderSection) => BuilderSection) =>
    setDoc({ ...doc, sections: doc.sections.map((s) => (s._key === sectionKey ? fn(s) : s)) });

  const regenerate = async (section: BuilderSection, question: BuilderQuestion) => {
    try {
      const avoid = doc.sections.flatMap((s) => s.questions.map((q) => q.text)).filter(Boolean);
      const { question: generated } = await api<{ question: QuestionData }>(
        "/api/interviews/templates/question",
        {
          method: "POST",
          body: {
            jobId,
            sectionName: section.name,
            skillId: question.skillId,
            type: question.type,
            difficulty: question.difficulty,
            avoid,
          },
        },
      );
      updateSection(section._key, (s) => ({
        ...s,
        questions: s.questions.map((q) =>
          q._key === question._key ? { ...generated, _key: q._key, mandatory: q.mandatory } : q,
        ),
      }));
      toast.success("Question regenerated");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't generate a question.");
    }
  };

  return (
    <div className="space-y-6">
      {doc.sections.map((section) => (
        <section
          key={section._key}
          aria-labelledby={`sec-${section._key}`}
          className="rounded-xl border bg-card p-4 shadow-xs"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 id={`sec-${section._key}`} className="font-semibold">
                {section.name}
              </h3>
              <p className="text-xs text-muted-foreground">
                {section.questions.length} question{section.questions.length === 1 ? "" : "s"} ·
                asks {section.minQuestions}–{section.maxQuestions} · {section.targetDurationMinutes}{" "}
                min
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setBankFor(section._key)}
              >
                <Library /> From bank
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  updateSection(section._key, (s) => ({
                    ...s,
                    questions: [...s.questions, blankQuestion(s.focusSkillIds[0] ?? null)],
                  }))
                }
              >
                <Plus /> Add question
              </Button>
            </div>
          </div>
          {section.questions.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              No fixed questions. The AI can generate questions for this section if dynamic
              questions are enabled.
            </p>
          ) : (
            <ol className="space-y-2">
              {section.questions.map((question, index) => (
                <QuestionCard
                  key={question._key}
                  question={question}
                  index={index}
                  total={section.questions.length}
                  skills={skills}
                  onChange={(q) =>
                    updateSection(section._key, (s) => ({
                      ...s,
                      questions: s.questions.map((x) => (x._key === q._key ? q : x)),
                    }))
                  }
                  onRemove={() =>
                    updateSection(section._key, (s) => ({
                      ...s,
                      questions: s.questions.filter((x) => x._key !== question._key),
                    }))
                  }
                  onMove={(dir) =>
                    updateSection(section._key, (s) => {
                      const qs = [...s.questions];
                      const [moved] = qs.splice(index, 1);
                      qs.splice(index + dir, 0, moved!);
                      return { ...s, questions: qs };
                    })
                  }
                  onRegenerate={() => regenerate(section, question)}
                />
              ))}
            </ol>
          )}
        </section>
      ))}
      <BankPicker
        open={bankFor !== null}
        onOpenChange={(o) => !o && setBankFor(null)}
        onPick={(item) => {
          if (!bankFor) return;
          updateSection(bankFor, (s) => ({
            ...s,
            questions: [
              ...s.questions,
              {
                _key: key(),
                text: item.text,
                type: item.type,
                difficulty: item.difficulty,
                skillId: skills.some((sk) => sk.id === item.skillId) ? item.skillId : null,
                weight: item.weight,
                expectedTopics: item.expectedTopics,
                idealAnswer: item.idealAnswer,
                redFlags: item.redFlags,
                followUpGuidance: item.followUpGuidance,
                mandatory: false,
                source: "FIXED",
                bankItemId: item.id,
              },
            ],
          }));
          toast.success("Question added");
        }}
      />
    </div>
  );
}
