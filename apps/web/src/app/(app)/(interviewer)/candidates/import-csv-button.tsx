"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { Button } from "@repo/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/dialog";
import { toast } from "@repo/ui/sonner";
import { api, ApiError } from "@/lib/api-client";

interface ImportResult {
  created: number;
  existing: number;
  errors: Array<{ row: number; errors: Record<string, string[]> }>;
}

export function ImportCsvButton({ jobId }: { jobId?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function onFile(file: File) {
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api<ImportResult>(
        `/api/candidates/import${jobId ? `?jobId=${jobId}` : ""}`,
        { method: "POST", body: form },
      );
      setResult(res);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Import failed");
    } finally {
      setLoading(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        aria-label="Choose CSV file"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <Button variant="outline" loading={loading} onClick={() => input.current?.click()}>
        <FileUp /> Import CSV
      </Button>
      <Dialog open={result !== null} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import complete</DialogTitle>
            <DialogDescription>
              {result?.created ?? 0} added · {result?.existing ?? 0} already existed ·{" "}
              {result?.errors.length ?? 0} skipped
            </DialogDescription>
          </DialogHeader>
          {result && result.errors.length > 0 ? (
            <ul className="max-h-60 space-y-1 overflow-y-auto rounded-lg border p-3 text-sm">
              {result.errors.map((e) => (
                <li key={e.row}>
                  <span className="font-medium">Row {e.row}:</span>{" "}
                  <span className="text-muted-foreground">
                    {Object.entries(e.errors)
                      .map(([k, v]) => `${k}: ${v.join(", ")}`)
                      .join("; ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Expected columns: first_name, last_name, email, phone, linkedin, location.
          </p>
          <DialogFooter>
            <Button onClick={() => setResult(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
