import Link from "next/link";
import { Bot, Settings2, User } from "lucide-react";
import type { SalesActivityView } from "@repo/core";
import { cn } from "@repo/ui/cn";
import { formatDateTime, formatRelative } from "@/lib/format";

const ACTOR_ICON = { AI: Bot, USER: User, SYSTEM: Settings2, CANDIDATE: User } as const;

/** Chronological feed of what the AI and the team did (newest first). */
export function ActivityFeed({
  items,
  showLead = true,
  empty = "Nothing has happened yet.",
}: {
  items: SalesActivityView[];
  showLead?: boolean;
  empty?: string;
}) {
  if (items.length === 0)
    return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-border">
      {items.map((item) => {
        const Icon = ACTOR_ICON[item.actorType] ?? Settings2;
        return (
          <li key={item.id} className="relative flex gap-3">
            <span
              className={cn(
                "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border bg-card",
                item.actorType === "AI" && "border-primary/40 bg-primary/10 text-primary",
              )}
              aria-hidden="true"
            >
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 pt-0.5 text-sm">
              <p>
                {item.summary}
                {showLead && item.leadId && item.leadName ? (
                  <>
                    {" · "}
                    <Link
                      href={`/sales/leads/${item.leadId}`}
                      className="font-medium hover:underline"
                    >
                      {item.leadName}
                    </Link>
                  </>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="sr-only">
                  {item.actorType === "AI"
                    ? "By the AI · "
                    : item.actorName
                      ? `By ${item.actorName} · `
                      : ""}
                </span>
                <time dateTime={item.createdAt} title={formatDateTime(item.createdAt)}>
                  {formatRelative(item.createdAt)}
                </time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
