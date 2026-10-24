"use client";

import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@repo/ui/button";

/**
 * Errors that mean this tab is running older page code than the server (after an
 * update or deploy): a component or chunk it needs is missing. Reloading fixes them.
 */
const STALE_CODE =
  /Lazy element type must resolve|ChunkLoadError|Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i;
const RELOADED_AT = "cadre:stale-code-reload";

function isStaleCode(error: Error): boolean {
  return error.name === "ChunkLoadError" || STALE_CODE.test(error.message);
}

/** Friendly error boundary — never shows stack traces (spec §63). */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const stale = isStaleCode(error);

  useEffect(() => {
    console.error(error);
    if (!stale) return;
    // Reload once to pick up the current code; the timestamp stops a reload loop.
    try {
      const last = Number(sessionStorage.getItem(RELOADED_AT) ?? 0);
      if (Date.now() - last < 30_000) return;
      sessionStorage.setItem(RELOADED_AT, String(Date.now()));
    } catch {
      return;
    }
    window.location.reload();
  }, [error, stale]);

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 p-5 text-center">
      <h1 className="text-2xl font-semibold">
        {stale ? "This page was updated" : "Something went wrong"}
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {stale
          ? "Reload to get the latest version."
          : "We hit an unexpected problem. Please try again."}
        {!stale && error.digest ? ` Reference: ${error.digest}` : ""}
      </p>
      <Button
        onClick={() => {
          if (stale) {
            window.location.reload();
            return;
          }
          startTransition(() => {
            router.refresh();
            reset();
          });
        }}
      >
        {stale ? "Reload page" : "Try again"}
      </Button>
    </div>
  );
}
