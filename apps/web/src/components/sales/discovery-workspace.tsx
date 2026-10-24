"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ExternalLink,
  FlaskConical,
  Globe,
  Loader2,
  Search,
  Sparkles,
  UserPlus,
} from "lucide-react";
import type { DiscoveryMode } from "@repo/ai";
import type { DiscoveryCandidate, DiscoveryRunView } from "@repo/core";
import { COMPANY_SIZE_BANDS } from "@repo/validation";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/card";
import { cn } from "@repo/ui/cn";
import { Input, Textarea } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Alert, AlertDescription, AlertTitle, Checkbox } from "@repo/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { toast } from "@repo/ui/sonner";
import { FormError } from "@/components/forms";
import { api, ApiError } from "@/lib/api-client";
import { formatRelative } from "@/lib/format";
import type { MapArea, MapPin } from "./area-map";
import { DiscoveryLocation, type LocationMode } from "./discovery-location";

export interface DiscoveryDefaults {
  industries: string[];
  countries: string[];
  cities: string[];
  companySizes: string[];
}

const splitList = (value: string) =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 10);

const WEBSITE_BADGE: Record<
  DiscoveryCandidate["websiteCheck"],
  { label: string; variant: "success" | "warning" | "muted" | "info" }
> = {
  verified: { label: "Website verified", variant: "success" },
  unreachable: { label: "Website not reachable", variant: "warning" },
  none: { label: "No website found", variant: "muted" },
  sample: { label: "Demo sample", variant: "info" },
};

const isActive = (run: DiscoveryRunView | null) =>
  run?.status === "QUEUED" || run?.status === "RUNNING";

const selectable = (c: DiscoveryCandidate) => !c.addedLeadId && !c.duplicateOf;

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function HowItSearches({
  reasoning,
  model,
  webSearch,
}: {
  reasoning: "ai" | "rules";
  model: string;
  webSearch: boolean;
}) {
  const steps = [
    "OpenStreetMap business listings (open data)",
    "Wikidata company records (open data)",
    reasoning === "ai" ? "Business directories and association member lists, read by the AI" : null,
    webSearch ? "Claude web search" : null,
    "Each company's own website: contact, about and team pages",
  ].filter((step): step is string => step !== null);
  return (
    <Alert variant={reasoning === "ai" ? "default" : "info"}>
      <Bot aria-hidden="true" />
      <AlertTitle>How your AI researcher searches</AlertTitle>
      <AlertDescription>
        <ol className="list-decimal space-y-0.5 pl-4">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="mt-1">
          {reasoning === "ai"
            ? `Planning, reading and fit checks by ${model}.`
            : "No AI model is connected, so matching uses keyword rules and directories aren't read. Connect a model — a free local one works (AI_PROVIDER=ollama) — for deeper, smarter searches and named decision makers."}
        </p>
      </AlertDescription>
    </Alert>
  );
}

function SourceNote({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="ml-1.5 text-muted-foreground hover:underline"
    >
      (found on {hostname(url)})
    </a>
  );
}

function CandidateRow({
  candidate,
  checked,
  onCheckedChange,
  canAdd,
}: {
  candidate: DiscoveryCandidate;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  canAdd: boolean;
}) {
  const c = candidate;
  const place = [c.city, c.country].filter(Boolean).join(", ");
  const meta = [
    c.distanceKm !== null ? `${c.distanceKm} km away` : null,
    place,
    c.industry,
    c.companySize ? `${c.companySize} employees` : null,
  ].filter(Boolean);
  const id = `candidate-${c.id}`;
  return (
    <li
      className={cn(
        "flex gap-3 rounded-xl border p-4 transition-colors",
        checked ? "border-primary/50 bg-primary/5" : "bg-card",
      )}
    >
      <Checkbox
        id={id}
        className="mt-1"
        checked={checked}
        disabled={!canAdd || !selectable(c)}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        aria-label={`Select ${c.companyName}`}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={id} className="font-medium">
            {c.companyName}
          </label>
          {c.website ? (
            <a
              href={c.website}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
            >
              <Globe className="size-3" aria-hidden="true" />
              {hostname(c.website)}
            </a>
          ) : null}
          <Badge variant={WEBSITE_BADGE[c.websiteCheck].variant}>
            {WEBSITE_BADGE[c.websiteCheck].label}
          </Badge>
          {c.addedLeadId ? (
            <Badge variant="success" asChild>
              <Link href={`/sales/leads/${c.addedLeadId}`}>
                <CheckCircle2 aria-hidden="true" /> Added
              </Link>
            </Badge>
          ) : c.duplicateOf ? (
            <Badge variant="muted" asChild>
              <Link href={`/sales/leads/${c.duplicateOf.leadId}`}>Already in your leads</Link>
            </Badge>
          ) : null}
        </div>
        {meta.length > 0 ? (
          <p className="text-xs text-muted-foreground">{meta.join(" · ")}</p>
        ) : null}
        {c.description ? <p className="text-sm">{c.description}</p> : null}
        {c.matchReasons.length > 0 ? (
          <ul className="space-y-0.5 text-sm text-muted-foreground">
            {c.matchReasons.map((reason) => (
              <li key={reason} className="flex gap-1.5">
                <CheckCircle2
                  className="mt-0.5 size-3.5 shrink-0 text-primary"
                  aria-hidden="true"
                />
                {reason}
              </li>
            ))}
          </ul>
        ) : null}
        {c.people.length > 0 || c.email || c.phone || c.linkedinUrl || c.address ? (
          <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
            {c.people.length > 0 ? (
              <>
                <dt className="text-muted-foreground">People</dt>
                <dd>
                  {c.people.map((p, i) => (
                    <span key={`${p.fullName}-${i}`}>
                      {i > 0 ? " · " : null}
                      <a
                        href={p.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="hover:underline"
                        title="Named on this page of their website"
                      >
                        {p.fullName}
                        {p.jobTitle ? `, ${p.jobTitle}` : ""}
                      </a>
                    </span>
                  ))}
                </dd>
              </>
            ) : null}
            {c.email ? (
              <>
                <dt className="text-muted-foreground">Email</dt>
                <dd>
                  {c.email}
                  {c.emailSource ? <SourceNote url={c.emailSource} /> : null}
                </dd>
              </>
            ) : null}
            {c.phone ? (
              <>
                <dt className="text-muted-foreground">Phone</dt>
                <dd>
                  {c.phone}
                  {c.phoneSource ? <SourceNote url={c.phoneSource} /> : null}
                </dd>
              </>
            ) : null}
            {c.linkedinUrl ? (
              <>
                <dt className="text-muted-foreground">LinkedIn</dt>
                <dd>
                  <a
                    href={c.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="hover:underline"
                  >
                    Company page
                  </a>{" "}
                  <span className="text-muted-foreground">(linked from their website)</span>
                </dd>
              </>
            ) : null}
            {c.address ? (
              <>
                <dt className="text-muted-foreground">Address</dt>
                <dd>{c.address}</dd>
              </>
            ) : null}
          </dl>
        ) : null}
        {c.sources.length > 0 ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>Sources:</span>
            {c.sources.map((s) => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-0.5 hover:underline"
              >
                {hostname(s.url)} <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            ))}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function DiscoveryWorkspace({
  mode,
  defaults,
  runs: initialRuns,
  initialRunId,
  canRun,
  canAdd,
  autonomous,
  reasoning,
  model,
  webSearch,
}: {
  mode: DiscoveryMode;
  defaults: DiscoveryDefaults;
  runs: DiscoveryRunView[];
  initialRunId: string | null;
  canRun: boolean;
  canAdd: boolean;
  autonomous: boolean;
  /** "ai": a language model plans, reads directories and judges; "rules": keyword rules. */
  reasoning: "ai" | "rules";
  model: string;
  webSearch: boolean;
}) {
  const router = useRouter();
  const [runs, setRuns] = useState(initialRuns);
  const [runId, setRunId] = useState<string | null>(initialRunId ?? initialRuns[0]?.id ?? null);
  const run = runs.find((r) => r.id === runId) ?? null;

  const [industries, setIndustries] = useState(defaults.industries.join(", "));
  const [countries, setCountries] = useState(defaults.countries.join(", "));
  const [cities, setCities] = useState(defaults.cities.join(", "));
  const [sizes, setSizes] = useState<string[]>(defaults.companySizes);
  const [keywords, setKeywords] = useState("");
  const [count, setCount] = useState("10");
  const [depth, setDepth] = useState<"quick" | "deep">("deep");
  const [locationMode, setLocationMode] = useState<LocationMode>("places");
  const [area, setArea] = useState<MapArea | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [research, setResearch] = useState(false);
  const [adding, setAdding] = useState(false);

  const upsertRun = (next: DiscoveryRunView) =>
    setRuns((prev) => [next, ...prev.filter((r) => r.id !== next.id)]);

  // Poll the active run until it finishes.
  useEffect(() => {
    if (!run || !isActive(run)) return;
    const id = window.setInterval(async () => {
      try {
        const { run: latest } = await api<{ run: DiscoveryRunView }>(
          `/api/sales/discovery/${run.id}`,
        );
        upsertRun(latest);
        if (!isActive(latest)) {
          window.clearInterval(id);
          setSelected(new Set(latest.candidates.filter(selectable).map((c) => c.id)));
          router.refresh();
        }
      } catch {
        // Keep polling through transient errors.
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [run?.id, run?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = useMemo(() => run?.candidates.filter(selectable) ?? [], [run]);
  const pins = useMemo<MapPin[]>(
    () =>
      (run?.candidates ?? [])
        .filter((c) => c.lat !== null && c.lon !== null)
        .map((c) => ({
          id: c.id,
          lat: c.lat!,
          lon: c.lon!,
          label: c.companyName,
          added: Boolean(c.addedLeadId),
        })),
    [run],
  );

  async function start(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (locationMode === "map" && !area) {
      setError("Search a place or click the map to choose where to look.");
      return;
    }
    setStarting(true);
    try {
      const { run: started } = await api<{ run: DiscoveryRunView }>("/api/sales/discovery", {
        method: "POST",
        body: {
          industries: splitList(industries),
          countries: locationMode === "map" ? [] : splitList(countries),
          cities: locationMode === "map" ? [] : splitList(cities),
          area: locationMode === "map" ? area : null,
          companySizes: sizes,
          keywords,
          count: Number(count),
          depth,
        },
      });
      upsertRun(started);
      setRunId(started.id);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't start the search. Try again.");
    } finally {
      setStarting(false);
    }
  }

  async function addSelected() {
    if (!run || selected.size === 0) return;
    setAdding(true);
    try {
      const result = await api<{ added: number; skipped: number; researchQueued: number }>(
        `/api/sales/discovery/${run.id}/add`,
        { method: "POST", body: { candidateIds: [...selected], research } },
      );
      const { run: latest } = await api<{ run: DiscoveryRunView }>(
        `/api/sales/discovery/${run.id}`,
      );
      upsertRun(latest);
      setSelected(new Set());
      toast.success(
        `Added ${result.added} lead${result.added === 1 ? "" : "s"}${result.skipped ? ` · ${result.skipped} already existed` : ""}${result.researchQueued ? ` · researching ${result.researchQueued}` : ""}`,
        { action: { label: "View leads", onClick: () => router.push("/sales/leads?sort=newest") } },
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't add the leads. Try again.");
    } finally {
      setAdding(false);
    }
  }

  const disabled = !canRun || mode === "unavailable";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="space-y-4">
        {mode === "demo" ? (
          <Alert variant="info">
            <FlaskConical aria-hidden="true" />
            <AlertTitle>Demo mode: fictional sample companies</AlertTitle>
            <AlertDescription>
              <p>
                This workspace is set to sample data (<code>DISCOVERY_PROVIDER=samples</code>), so
                results are made-up companies on .example domains. Set{" "}
                <code>DISCOVERY_PROVIDER=agent</code> to search real businesses.
              </p>
            </AlertDescription>
          </Alert>
        ) : mode === "unavailable" ? (
          <Alert variant="warning">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Discovery isn&apos;t available</AlertTitle>
            <AlertDescription>
              Lead discovery is turned off here. Import a CSV or add leads manually.
            </AlertDescription>
          </Alert>
        ) : (
          <HowItSearches reasoning={reasoning} model={model} webSearch={webSearch} />
        )}

        <Card>
          <CardHeader>
            <CardTitle>What should I look for?</CardTitle>
            <CardDescription>
              Pre-filled from your ideal customer profile. Separate values with commas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={start}>
              <div className="space-y-1.5">
                <Label htmlFor="d-industries">Industries</Label>
                <Input
                  id="d-industries"
                  value={industries}
                  onChange={(e) => setIndustries(e.target.value)}
                  placeholder="Real estate, Property management"
                  disabled={disabled}
                />
              </div>
              <DiscoveryLocation
                mode={locationMode}
                onModeChange={setLocationMode}
                countries={countries}
                onCountriesChange={setCountries}
                cities={cities}
                onCitiesChange={setCities}
                area={area}
                onAreaChange={setArea}
                pins={pins}
                disabled={disabled}
              />
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">Company size (employees)</legend>
                <div className="flex flex-wrap gap-1.5">
                  {COMPANY_SIZE_BANDS.map((band) => {
                    const on = sizes.includes(band);
                    return (
                      <Button
                        key={band}
                        type="button"
                        size="sm"
                        variant={on ? "default" : "outline"}
                        aria-pressed={on}
                        disabled={disabled}
                        onClick={() =>
                          setSizes((prev) =>
                            on ? prev.filter((s) => s !== band) : [...prev, band],
                          )
                        }
                      >
                        {band}
                      </Button>
                    );
                  })}
                </div>
              </fieldset>
              <div className="space-y-1.5">
                <Label htmlFor="d-keywords">Anything else? (optional)</Label>
                <Textarea
                  id="d-keywords"
                  rows={3}
                  maxLength={500}
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="e.g. agencies with many listings but an outdated website"
                  disabled={disabled}
                />
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="d-count">How many</Label>
                  <Select value={count} onValueChange={setCount} disabled={disabled}>
                    <SelectTrigger id="d-count" className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["5", "10", "15", "25"].map((n) => (
                        <SelectItem key={n} value={n}>
                          {n} companies
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="d-depth">Search depth</Label>
                  <Select
                    value={depth}
                    onValueChange={(v) => setDepth(v as "quick" | "deep")}
                    disabled={disabled}
                  >
                    <SelectTrigger id="d-depth" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="quick">Quick</SelectItem>
                      <SelectItem value="deep">Deep</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={disabled || starting || isActive(run)}
                >
                  {starting || isActive(run) ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Search aria-hidden="true" />
                  )}
                  {isActive(run) ? "Searching…" : "Find leads"}
                </Button>
              </div>
              <FormError message={error} />
              <p className="text-xs text-muted-foreground">
                {autonomous
                  ? "Autonomous mode: verified new companies are added to your leads automatically."
                  : "You choose which companies become leads. Nothing is contacted."}{" "}
                {mode === "web"
                  ? "Only public sources are used; robots.txt is respected and social networks are never crawled."
                  : null}
              </p>
            </form>
          </CardContent>
        </Card>

        {runs.length > 1 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Previous searches</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {runs.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setRunId(r.id);
                        setSelected(new Set());
                      }}
                      className={cn(
                        "w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                        r.id === runId && "bg-muted font-medium",
                      )}
                    >
                      {r.criteria.industries.slice(0, 2).join(", ") || "Any industry"}
                      {r.criteria.area
                        ? ` · within ${r.criteria.area.radiusKm} km of ${r.criteria.area.label?.split(",")[0] ?? "a map point"}`
                        : ""}
                      {!r.criteria.area && r.criteria.countries.length
                        ? ` · ${r.criteria.countries.slice(0, 2).join(", ")}`
                        : ""}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {formatRelative(r.createdAt)} ·{" "}
                        {r.status === "COMPLETED"
                          ? `${r.candidates.length} found, ${r.candidates.filter((c) => c.addedLeadId).length} added`
                          : r.status.toLowerCase()}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Card className="min-h-80">
        {!run ? (
          <CardContent className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-6" aria-hidden="true" />
            </span>
            <p className="font-medium">Let your AI sales employee find prospects</p>
            <p className="max-w-md text-sm text-muted-foreground">
              It searches for companies that match your criteria, checks their websites exist, skips
              ones already in your leads, and cites where it found each one.
            </p>
          </CardContent>
        ) : isActive(run) ? (
          <CardContent className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center">
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
            <p className="font-medium" role="status">
              {run.progress ?? "Searching for companies…"}
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              {mode === "web"
                ? `A ${run.criteria.depth} search usually takes ${run.criteria.depth === "deep" ? "three to eight" : "one to three"} minutes. You can leave this page; you'll get a notification when it's done.`
                : "Preparing sample results…"}
            </p>
          </CardContent>
        ) : run.status === "FAILED" ? (
          <CardContent className="py-10">
            <Alert variant="destructive">
              <AlertTriangle aria-hidden="true" />
              <AlertTitle>The search didn&apos;t finish</AlertTitle>
              <AlertDescription>Lead discovery unavailable — {run.error}</AlertDescription>
            </Alert>
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <CardTitle>
                {run.candidates.length === 0
                  ? "No new companies found"
                  : `${run.candidates.length} ${run.candidates.length === 1 ? "company" : "companies"} found`}
              </CardTitle>
              <CardDescription>
                {run.summary ?? "Review the companies and add the ones you want to work on."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {run.notes.length > 0 ? (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {run.notes.map((n) => (
                    <li key={n}>• {n}</li>
                  ))}
                </ul>
              ) : null}
              {run.candidates.length > 0 ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Checkbox
                        id="select-all"
                        checked={ready.length > 0 && ready.every((c) => selected.has(c.id))}
                        disabled={!canAdd || ready.length === 0}
                        onCheckedChange={(v) =>
                          setSelected(v === true ? new Set(ready.map((c) => c.id)) : new Set())
                        }
                      />
                      <label htmlFor="select-all">Select all new ({ready.length})</label>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Checkbox
                          id="research-added"
                          checked={research}
                          disabled={!canAdd}
                          onCheckedChange={(v) => setResearch(v === true)}
                        />
                        <label htmlFor="research-added">Research them with AI</label>
                      </div>
                      <Button
                        onClick={addSelected}
                        disabled={!canAdd || adding || selected.size === 0}
                      >
                        {adding ? (
                          <Loader2 className="animate-spin" aria-hidden="true" />
                        ) : (
                          <UserPlus aria-hidden="true" />
                        )}
                        Add {selected.size || ""} {selected.size === 1 ? "lead" : "leads"}
                      </Button>
                    </div>
                  </div>
                  <ul className="space-y-3">
                    {run.candidates.map((candidate) => (
                      <CandidateRow
                        key={candidate.id}
                        candidate={candidate}
                        canAdd={canAdd}
                        checked={selected.has(candidate.id)}
                        onCheckedChange={(value) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (value) next.add(candidate.id);
                            else next.delete(candidate.id);
                            return next;
                          })
                        }
                      />
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Try broader criteria — more industries, countries or company sizes.
                </p>
              )}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
