"use client";

import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileUp, Plus, Search, Trash2 } from "lucide-react";
import {
  QUESTION_DIFFICULTIES,
  QUESTION_TYPES,
  type QuestionDifficulty,
  type QuestionType,
} from "@repo/shared";
import { questionBankItemSchema } from "@repo/validation";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/dialog";
import { Input, Textarea } from "@repo/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { toast } from "@repo/ui/sonner";
import { Field, FormError, useFormErrors } from "@/components/forms";
import { api, ApiError } from "@/lib/api-client";
import { DIFFICULTY_LABELS, QUESTION_TYPE_LABELS } from "@/lib/format";

interface Item {
  id: string;
  text: string;
  type: QuestionType;
  difficulty: QuestionDifficulty;
  skillId: string | null;
  skillName: string | null;
  tags: string[];
  expectedTopics: string[];
  idealAnswer: string | null;
  weight: number;
}

function NewQuestionDialog({ skills }: { skills: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    text: "",
    type: "TECHNICAL" as QuestionType,
    difficulty: "MEDIUM" as QuestionDifficulty,
    skillId: "",
    tags: "",
    expectedTopics: "",
    idealAnswer: "",
  });
  const [saving, setSaving] = useState(false);
  const { errors, formError, validate, handleError } = useFormErrors();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> New question
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add a question</DialogTitle>
          <DialogDescription>Saved questions can be added to any interview.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const split = (s: string) =>
              s
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean);
            const payload = {
              text: form.text,
              type: form.type,
              difficulty: form.difficulty,
              skillId: form.skillId || null,
              tags: split(form.tags),
              expectedTopics: split(form.expectedTopics),
              idealAnswer: form.idealAnswer || null,
            };
            if (!validate(questionBankItemSchema, payload)) return;
            setSaving(true);
            try {
              await api("/api/question-bank", { method: "POST", body: payload });
              toast.success("Question saved");
              setOpen(false);
              setForm({ ...form, text: "", tags: "", expectedTopics: "", idealAnswer: "" });
              router.refresh();
            } catch (err) {
              handleError(err);
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="sm:col-span-2">
            <FormError message={formError} />
          </div>
          <Field
            label="Question"
            htmlFor="b-text"
            error={errors.text}
            required
            className="sm:col-span-2"
          >
            <Textarea
              id="b-text"
              rows={2}
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
            />
          </Field>
          <Field label="Type" htmlFor="b-type">
            <Select
              value={form.type}
              onValueChange={(v) => setForm({ ...form, type: v as QuestionType })}
            >
              <SelectTrigger id="b-type">
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
          </Field>
          <Field label="Difficulty" htmlFor="b-diff">
            <Select
              value={form.difficulty}
              onValueChange={(v) => setForm({ ...form, difficulty: v as QuestionDifficulty })}
            >
              <SelectTrigger id="b-diff">
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
          </Field>
          <Field label="Skill" htmlFor="b-skill">
            <Select
              value={form.skillId || "none"}
              onValueChange={(v) => setForm({ ...form, skillId: v === "none" ? "" : v })}
            >
              <SelectTrigger id="b-skill">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">General</SelectItem>
                {skills.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tags" htmlFor="b-tags" hint="Comma-separated">
            <Input
              id="b-tags"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="Java, Backend"
            />
          </Field>
          <Field
            label="Expected topics"
            htmlFor="b-topics"
            className="sm:col-span-2"
            hint="Comma-separated"
          >
            <Input
              id="b-topics"
              value={form.expectedTopics}
              onChange={(e) => setForm({ ...form, expectedTopics: e.target.value })}
            />
          </Field>
          <Field label="Ideal answer (private)" htmlFor="b-ideal" className="sm:col-span-2">
            <Textarea
              id="b-ideal"
              rows={2}
              value={form.idealAnswer}
              onChange={(e) => setForm({ ...form, idealAnswer: e.target.value })}
            />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save question
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BankEditor({
  items,
  skills,
  canWrite,
  initialQuery,
}: {
  items: Item[];
  skills: Array<{ id: string; name: string }>;
  canWrite: boolean;
  initialQuery: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(initialQuery);
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form
          className="relative w-full sm:w-80"
          onSubmit={(e) => {
            e.preventDefault();
            router.replace(q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname);
          }}
        >
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label="Search questions"
            placeholder="Search questions"
            className="pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
        {canWrite ? (
          <div className="flex gap-2">
            <input
              ref={file}
              type="file"
              accept=".csv"
              className="sr-only"
              aria-label="Choose CSV file"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const form = new FormData();
                form.append("file", f);
                try {
                  const r = await api<{ created: number; errors: unknown[] }>(
                    "/api/question-bank/import",
                    { method: "POST", body: form },
                  );
                  toast.success(
                    `Imported ${r.created} questions${r.errors.length ? `, ${r.errors.length} rows skipped` : ""}`,
                  );
                  router.refresh();
                } catch (err) {
                  toast.error(err instanceof ApiError ? err.message : "Import failed");
                }
                e.target.value = "";
              }}
            />
            <Button variant="outline" onClick={() => file.current?.click()}>
              <FileUp /> Import CSV
            </Button>
            <NewQuestionDialog skills={skills} />
          </div>
        ) : null}
      </div>
      {items.length > 0 ? (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="text-sm">{item.text}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge variant="muted">{QUESTION_TYPE_LABELS[item.type]}</Badge>
                  <Badge variant="outline">{DIFFICULTY_LABELS[item.difficulty]}</Badge>
                  {item.skillName ? <Badge variant="info">{item.skillName}</Badge> : null}
                  {item.tags.map((t) => (
                    <Badge key={t} variant="secondary">
                      #{t}
                    </Badge>
                  ))}
                </div>
              </div>
              {canWrite ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete question"
                  onClick={async () => {
                    await api(`/api/question-bank/${item.id}`, { method: "DELETE" }).catch(
                      () => undefined,
                    );
                    router.refresh();
                  }}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
