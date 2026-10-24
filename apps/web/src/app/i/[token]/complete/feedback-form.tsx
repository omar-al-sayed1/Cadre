"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/cn";
import { Textarea } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { api } from "@/lib/api-client";

/** Optional experience survey (spec §125). It never affects the candidate's evaluation. */
export function FeedbackForm({ sessionId }: { sessionId: string }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  if (sent)
    return (
      <p className="text-center text-sm text-muted-foreground" role="status">
        Thanks for your feedback!
      </p>
    );
  return (
    <form
      className="rounded-2xl border bg-card p-6 shadow-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!rating) return;
        setLoading(true);
        await api(`/api/interview-session/${sessionId}/feedback`, {
          method: "POST",
          body: { rating, comment: comment || null },
        }).catch(() => undefined);
        setSent(true);
      }}
    >
      <h2 className="font-semibold">How was your interview experience?</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Optional and anonymous to the evaluation — it doesn&apos;t affect your results.
      </p>
      <div className="mt-4 flex gap-1" role="radiogroup" aria-label="Rating from 1 to 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} out of 5`}
            onClick={() => setRating(n)}
            className="rounded p-1 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Star
              className={cn(
                "size-7",
                n <= rating ? "fill-warning text-warning" : "text-muted-foreground",
              )}
            />
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-1.5">
        <Label htmlFor="comment">Comments (optional)</Label>
        <Textarea
          id="comment"
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={2000}
        />
      </div>
      <div className="mt-4 flex justify-end">
        <Button type="submit" disabled={!rating} loading={loading}>
          Send feedback
        </Button>
      </div>
    </form>
  );
}
