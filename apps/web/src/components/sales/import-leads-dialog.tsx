"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileUp, Upload } from "lucide-react";
import type { ImportResult } from "@repo/core";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { toast } from "@repo/ui/sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import { FormError } from "@/components/forms";
import { api, ApiError } from "@/lib/api-client";

const FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  fullName: "Full name",
  companyName: "Company",
  jobTitle: "Job title",
  email: "Email",
  phone: "Phone",
  website: "Website",
  linkedinUrl: "LinkedIn URL",
  location: "Location",
  city: "City",
  country: "Country",
  industry: "Industry",
  companySize: "Company size",
  notes: "Notes",
  tags: "Tags",
};

const MAX_FILE_BYTES = 5_000_000;

/** Upload a CSV, review the mapping and every row (new / duplicate / invalid), then import. */
export function ImportLeadsDialog() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCsv(null);
    setFileName("");
    setPreview(null);
    setMapping({});
    setError(null);
  }

  async function runPreview(text: string, map?: Record<string, string | null>) {
    setBusy(true);
    setError(null);
    try {
      const result = await api<ImportResult>("/api/sales/leads/import", {
        method: "POST",
        body: { csv: text, mapping: map, commit: false },
      });
      setPreview(result);
      setMapping(result.mapping);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't read this file.");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError("The file is larger than 5 MB. Split it into smaller files.");
      return;
    }
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setError("Upload a .csv file. In Excel, use File → Save As → CSV.");
      return;
    }
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    await runPreview(text);
  }

  async function commit() {
    if (!csv) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<ImportResult>("/api/sales/leads/import", {
        method: "POST",
        body: { csv, mapping, commit: true },
      });
      toast.success(
        `Imported ${result.created} lead${result.created === 1 ? "" : "s"}${result.counts.duplicate ? ` · ${result.counts.duplicate} duplicate${result.counts.duplicate === 1 ? "" : "s"} skipped` : ""}`,
      );
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed. Nothing was imported.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload /> Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import leads</DialogTitle>
          <DialogDescription>
            We match your columns automatically and skip duplicates — nothing is imported until you
            confirm.
          </DialogDescription>
        </DialogHeader>
        <FormError message={error} />
        {!preview ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            disabled={busy}
          >
            <FileUp className="size-6 text-muted-foreground" aria-hidden="true" />
            <span className="font-medium">{busy ? "Reading file…" : "Choose a CSV file"}</span>
            <span className="text-sm text-muted-foreground">
              Up to 2,000 rows · columns like Name, Company, Email, Title, Country
            </span>
          </button>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{fileName}</span>
              <Badge variant="success">{preview.counts.new} new</Badge>
              <Badge variant="warning">{preview.counts.duplicate} duplicate</Badge>
              <Badge variant="muted">{preview.counts.invalid} invalid</Badge>
            </div>
            <section aria-labelledby="mapping-title" className="space-y-2">
              <h3 id="mapping-title" className="text-sm font-semibold">
                Column mapping
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {preview.headers.map((header) => (
                  <div key={header} className="flex items-center gap-2 text-sm">
                    <span
                      className="w-36 truncate font-mono text-xs text-muted-foreground"
                      title={header}
                    >
                      {header}
                    </span>
                    <Select
                      value={mapping[header] ?? "ignore"}
                      onValueChange={(v) => {
                        const next = { ...mapping, [header]: v === "ignore" ? null : v };
                        setMapping(next);
                        if (csv) void runPreview(csv, next);
                      }}
                    >
                      <SelectTrigger
                        className="h-8 flex-1"
                        aria-label={`Field for column ${header}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ignore">Don&apos;t import</SelectItem>
                        {preview.fields.map((f) => (
                          <SelectItem key={f} value={f}>
                            {FIELD_LABELS[f] ?? f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </section>
            <div className="max-h-72 overflow-y-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Row</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.slice(0, 200).map((row) => (
                    <TableRow key={row.rowNumber}>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {row.rowNumber}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{row.name ?? "—"}</span>
                        {row.companyName ? (
                          <span className="text-muted-foreground"> · {row.companyName}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.status === "new" ? (
                          <Badge variant="success">New</Badge>
                        ) : row.status === "duplicate" ? (
                          <span className="text-warning-foreground">
                            Duplicate{row.duplicateOf ? ` of ${row.duplicateOf.name}` : ""} —{" "}
                            {row.message}
                          </span>
                        ) : (
                          <span className="text-destructive">{row.message}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-label="CSV file"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <DialogFooter>
          {preview ? (
            <Button variant="ghost" onClick={reset} disabled={busy}>
              Choose another file
            </Button>
          ) : null}
          <Button
            onClick={commit}
            loading={busy && Boolean(preview)}
            disabled={!preview || preview.counts.new === 0 || busy}
          >
            Import {preview?.counts.new ?? 0} lead{preview?.counts.new === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
