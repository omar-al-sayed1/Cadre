"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Search } from "lucide-react";
import type { SourcedFact } from "@repo/ai";
import type { ResearchView } from "@repo/core";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { toast } from "@repo/ui/sonner";
import { api, ApiError } from "@/lib/api-client";
import { formatRelative } from "@/lib/format";

const BASIS = {
  VERIFIED: { label: "Verified", variant: "success" },
  INFERRED: { label: "AI inference", variant: "info" },
  UNKNOWN: { label: "Unknown", variant: "muted" },
} as const;

function Fact({ fact }: { fact: SourcedFact }) {
  const isUrl = fact.source?.startsWith("http");
  return (
    <li className="flex items-start gap-2 text-sm">
      <Badge variant={BASIS[fact.basis].variant} className="mt-0.5 shrink-0">
        {BASIS[fact.basis].label}
      </Badge>
      <span className="min-w-0">
        {fact.statement}
        {fact.source ? (
          isUrl ? (
            <a
              href={fact.source}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="ml-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:underline"
            >
              source <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          ) : (
            <span className="ml-1 text-xs text-muted-foreground">({fact.source})</span>
          )
        ) : null}
      </span>
    </li>
  );
}

function FactGroup({ title, facts }: { title: string; facts: Array<SourcedFact | null> }) {
  const list = facts.filter((f): f is SourcedFact => Boolean(f));
  if (list.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
      <ul className="space-y-1.5">
        {list.map((f) => (
          <Fact key={f.statement} fact={f} />
        ))}
      </ul>
    </div>
  );
}

/** AI research on a lead: queued in the background, results labelled verified / inferred / unknown. */
export function ResearchPanel({
  leadId,
  initial,
  canRun,
}: {
  leadId: string;
  initial: ResearchView | null;
  canRun: boolean;
}) {
  const router = useRouter();
  const [research, setResearch] = useState(initial);
  const [starting, setStarting] = useState(false);
  const busy = research?.status === "QUEUED" || research?.status === "RUNNING";

  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(async () => {
      try {
        const { research: latest } = await api<{ research: ResearchView | null }>(
          `/api/sales/leads/${leadId}/research`,
        );
        setResearch(latest);
        if (latest && latest.status !== "QUEUED" && latest.status !== "RUNNING") {
          window.clearInterval(id);
          router.refresh();
        }
      } catch {
        // Keep polling; transient errors are fine.
      }
    }, 2500);
    return () => window.clearInterval(id);
  }, [busy, leadId, router]);

  async function start() {
    setStarting(true);
    try {
      const { research: queued } = await api<{ research: ResearchView }>(
        `/api/sales/leads/${leadId}/research`,
        { method: "POST", body: {} },
      );
      setResearch(queued);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Research couldn't be started.");
    } finally {
      setStarting(false);
    }
  }

  const r = research?.status === "COMPLETED" ? research.result : null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {busy
            ? "Researching… this usually takes a few seconds."
            : research?.status === "FAILED"
              ? `Research unavailable: ${research.error ?? "unknown error"}`
              : research?.completedAt
                ? `Researched ${formatRelative(research.completedAt)}${research.sources.length ? ` · ${research.sources.length} page${research.sources.length === 1 ? "" : "s"} read` : " · lead record only"}`
                : "Not researched yet. The AI reads the lead's own website (if any) and never invents facts."}
        </p>
        {canRun ? (
          <Button
            size="sm"
            variant={research ? "outline" : "default"}
            onClick={start}
            loading={starting}
            disabled={busy}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Search />}{" "}
            {research ? "Research again" : "Research lead"}
          </Button>
        ) : null}
      </div>
      {r ? (
        <div className="space-y-4">
          <p className="text-sm">{r.companySummary}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <FactGroup
              title="Company"
              facts={[
                r.industry,
                r.location,
                r.companySizeEstimate,
                r.possibleDecisionMaker,
                ...r.productsServices,
              ]}
            />
            <FactGroup title="Personalisation points" facts={r.personalizationPoints} />
            <FactGroup title="Potential problems" facts={r.potentialProblems} />
            <FactGroup title="Potential needs" facts={r.potentialNeeds} />
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p className="font-medium">Opportunity</p>
            <p className="text-muted-foreground">{r.salesOpportunity}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Problem relevance:{" "}
              {r.problemRelevance === null ? "unknown" : `${r.problemRelevance}/100`} · Confidence{" "}
              {Math.round(r.confidence * 100)}%
            </p>
          </div>
          {r.unknowns.length > 0 ? (
            <p className="text-xs text-muted-foreground">Unknown: {r.unknowns.join(" · ")}</p>
          ) : null}
          {research && research.notes.length > 0 ? (
            <p className="text-xs text-muted-foreground">{research.notes.join(" ")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
