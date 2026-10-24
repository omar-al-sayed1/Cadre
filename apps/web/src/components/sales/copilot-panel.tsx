"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Check, Copy, Send, Sparkles } from "lucide-react";
import type { CopilotExchange } from "@repo/core";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/cn";
import { Textarea } from "@repo/ui/input";
import { api, ApiError } from "@/lib/api-client";
import { formatRelative } from "@/lib/format";

const SUGGESTIONS = [
  "How should I approach this lead?",
  "Write a first email.",
  "Is this lead qualified?",
  "What should I do next?",
  "Summarize this lead.",
];

const ACTION_LABELS: Record<string, string> = {
  RESEARCH_LEAD: "Research the lead",
  ADD_DETAILS: "Add missing details",
  QUALIFY: "Mark as qualified",
  DISQUALIFY: "Mark as unqualified",
  CONTACT: "Reach out",
  FOLLOW_UP: "Follow up",
  SCHEDULE_CALL: "Propose a call",
  ESCALATE_TO_HUMAN: "Involve a person",
  STOP_OUTREACH: "Stop outreach",
};

const BASIS: Record<string, { label: string; variant: "success" | "info" | "muted" }> = {
  VERIFIED: { label: "Verified", variant: "success" },
  INFERRED: { label: "AI inference", variant: "info" },
  UNKNOWN: { label: "Unknown", variant: "muted" },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy draft"}
    </Button>
  );
}

function Answer({ exchange }: { exchange: CopilotExchange }) {
  const a = exchange.answer;
  const draftText = a.draft
    ? `${a.draft.subject ? `Subject: ${a.draft.subject}\n\n` : ""}${a.draft.body}`
    : "";
  return (
    <div className="space-y-3 rounded-xl bg-muted/50 p-4 text-sm">
      <p className="whitespace-pre-line">{a.answer}</p>
      {a.draft ? (
        <div className="space-y-2 rounded-lg border bg-card p-3">
          {a.draft.subject ? (
            <p className="text-xs text-muted-foreground">
              Subject: <span className="font-medium text-foreground">{a.draft.subject}</span>
            </p>
          ) : null}
          <p className="whitespace-pre-line">{a.draft.body}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <CopyButton text={draftText} />
            <span className="text-xs text-muted-foreground">
              Sending from Cadre arrives with mailbox integration. Review before using.
            </span>
          </div>
        </div>
      ) : null}
      {a.recommendedActions.length > 0 ? (
        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Recommended
          </p>
          <ul className="space-y-1.5">
            {a.recommendedActions.map((r) => (
              <li key={r.action + r.reason}>
                <span className="font-medium">{ACTION_LABELS[r.action] ?? r.action}</span>
                <span className="text-muted-foreground"> — {r.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {a.facts.length > 0 ? (
        <details className="group">
          <summary className="cursor-pointer text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            What this is based on ({a.facts.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {a.facts.map((f) => (
              <li key={f.statement} className="flex items-start gap-2">
                <Badge variant={BASIS[f.basis]?.variant ?? "muted"} className="shrink-0">
                  {BASIS[f.basis]?.label ?? f.basis}
                </Badge>
                <span>
                  {f.statement}
                  {f.source ? <span className="text-muted-foreground"> ({f.source})</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {a.missingInformation.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Would help: {a.missingInformation.join(" · ")}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Confidence {Math.round(a.confidence * 100)}% · AI suggestions — you decide what to do.
      </p>
    </div>
  );
}

/** "Ask Sales AI" about one lead. Advice only: nothing is changed or sent. */
export function CopilotPanel({
  leadId,
  initialHistory,
  enabled,
}: {
  leadId: string;
  initialHistory: CopilotExchange[];
  enabled: boolean;
}) {
  const [history, setHistory] = useState(initialHistory);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [history.length, pending]);

  async function ask(text: string) {
    const q = text.trim();
    if (q.length < 2 || pending) return;
    setPending(q);
    setError(null);
    setQuestion("");
    try {
      const { exchange } = await api<{ exchange: CopilotExchange }>(
        `/api/sales/leads/${leadId}/copilot`,
        { method: "POST", body: { question: q } },
      );
      setHistory((h) => [...h, exchange]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sales AI is unavailable right now.");
      setQuestion(q);
    } finally {
      setPending(null);
    }
  }

  return (
    <section
      aria-labelledby="copilot-title"
      className="flex flex-col rounded-2xl border bg-card shadow-xs"
    >
      <header className="flex items-center gap-2 border-b px-5 py-3.5">
        <Sparkles className="size-4 text-primary" aria-hidden="true" />
        <h2 id="copilot-title" className="font-semibold">
          Ask Sales AI
        </h2>
      </header>
      <div className="max-h-[32rem] space-y-5 overflow-y-auto px-5 py-4" aria-live="polite">
        {history.length === 0 && !pending ? (
          <p className="text-sm text-muted-foreground">
            Ask about this lead — how to approach them, whether they fit, what to do next, or for a
            first draft. The AI only sees this lead and your company&apos;s sales profile.
          </p>
        ) : null}
        {history.map((ex) => (
          <div key={ex.id} className="space-y-2">
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                {ex.question}
              </p>
            </div>
            <div className="flex gap-2">
              <Bot className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1 space-y-1">
                <Answer exchange={ex} />
                <p className="text-xs text-muted-foreground">
                  {ex.askedBy ? `Asked by ${ex.askedBy} · ` : ""}
                  {formatRelative(ex.createdAt)}
                </p>
              </div>
            </div>
          </div>
        ))}
        {pending ? (
          <div className="space-y-2">
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                {pending}
              </p>
            </div>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Bot className="size-4" aria-hidden="true" /> Thinking…
            </p>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
      <div className="space-y-3 border-t px-5 py-4">
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={!enabled || Boolean(pending)}
              onClick={() => ask(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
        >
          <Textarea
            aria-label="Ask Sales AI a question"
            rows={2}
            maxLength={1000}
            value={question}
            disabled={!enabled}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(question);
              }
            }}
            placeholder={enabled ? "Ask anything about this lead…" : "Your role can't use Sales AI"}
            className="min-h-0 resize-none"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Ask"
            disabled={!enabled || question.trim().length < 2 || Boolean(pending)}
          >
            <Send />
          </Button>
        </form>
      </div>
    </section>
  );
}
