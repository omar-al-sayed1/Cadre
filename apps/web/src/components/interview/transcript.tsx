"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@repo/ui/cn";
import type { ChatMessage } from "@/hooks/use-interview-controller";

function time(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Live transcript (captions) of the conversation — the accessible text record of every spoken line. */
export function Transcript({
  messages,
  interviewerName,
  partial,
  thinking,
}: {
  messages: ChatMessage[];
  interviewerName: string;
  partial: string;
  thinking: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, partial, thinking]);

  return (
    <div className="flex flex-col gap-3" aria-label="Interview transcript">
      <ol className="flex flex-col gap-3" aria-live="polite" aria-relevant="additions">
        {messages.map((m) => (
          <li
            key={m.id}
            className={cn(
              "flex flex-col gap-1",
              m.role === "CANDIDATE" ? "items-end" : "items-start",
            )}
          >
            <span className="px-1 text-[11px] font-medium text-muted-foreground">
              {m.role === "AI" ? interviewerName : "You"} · {time(m.createdAt)}
            </span>
            <div
              className={cn(
                "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line",
                m.role === "AI"
                  ? "rounded-tl-sm bg-muted"
                  : "rounded-tr-sm bg-primary text-primary-foreground",
                m.pending && "opacity-70",
                m.failed && "border border-destructive bg-destructive/10 text-destructive",
              )}
            >
              {m.content}
            </div>
            {m.failed ? (
              <span className="flex items-center gap-1 px-1 text-xs text-destructive">
                <AlertCircle className="size-3" aria-hidden="true" /> Not sent yet
              </span>
            ) : null}
          </li>
        ))}
        {partial ? (
          <li className="flex flex-col items-end gap-1">
            <span className="px-1 text-[11px] font-medium text-muted-foreground">
              You · speaking
            </span>
            <div className="max-w-[92%] rounded-2xl rounded-tr-sm border border-dashed border-primary/40 px-3.5 py-2.5 text-sm text-foreground/80 italic">
              {partial}
            </div>
          </li>
        ) : null}
        {thinking ? (
          <li className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {interviewerName} is
            thinking…
          </li>
        ) : null}
      </ol>
      <div ref={endRef} />
    </div>
  );
}
