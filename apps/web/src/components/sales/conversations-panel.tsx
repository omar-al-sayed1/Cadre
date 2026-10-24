"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Copy,
  MessageSquarePlus,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { brand } from "@repo/config";
import type { ConversationView, MessageView } from "@repo/core";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@repo/ui/dropdown-menu";
import { Input, Textarea } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { toast } from "@repo/ui/sonner";
import { FormError } from "@/components/forms";
import { api, ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";

const DRAFT_TYPES = [
  { value: "COLD_EMAIL", label: "First email" },
  { value: "FOLLOW_UP", label: "Follow-up email" },
  { value: "RE_ENGAGEMENT", label: "Re-engagement email" },
  { value: "PROPOSAL_FOLLOW_UP", label: "Proposal follow-up" },
  { value: "POST_MEETING_FOLLOW_UP", label: "Post-meeting follow-up" },
  { value: "MEETING_CONFIRMATION", label: "Meeting confirmation" },
  { value: "LINKEDIN_MESSAGE", label: "LinkedIn message" },
  { value: "WHATSAPP", label: "WhatsApp message" },
  { value: "SMS", label: "SMS" },
];

const CHANNELS = ["EMAIL", "LINKEDIN", "WHATSAPP", "SMS", "CALL", "MEETING", "OTHER"] as const;
const CHANNEL_LABELS: Record<string, string> = {
  EMAIL: "Email",
  LINKEDIN: "LinkedIn",
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
  CALL: "Call notes",
  MEETING: "Meeting notes",
  OTHER: "Other",
};

const INTENT_VARIANT: Record<string, "success" | "info" | "warning" | "danger" | "muted"> = {
  INTERESTED: "success",
  PRICE_REQUEST: "success",
  MEETING_REQUEST: "success",
  QUESTION: "info",
  OBJECTION: "warning",
  LATER: "muted",
  OUT_OF_OFFICE: "muted",
  WRONG_PERSON: "muted",
  NOT_INTERESTED: "danger",
  UNSUBSCRIBE: "danger",
  UNKNOWN: "muted",
};

function humanize(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
}

function CopyText({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check /> : <Copy />} {copied ? "Copied" : label}
    </Button>
  );
}

function Analysis({ message }: { message: MessageView }) {
  const a = message.analysis;
  if (!a) return null;
  return (
    <div className="mt-3 space-y-2 rounded-lg border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
        <Badge variant={INTENT_VARIANT[a.intent] ?? "muted"}>{humanize(a.intent)}</Badge>
        <Badge variant="muted">Intent {a.intentScore}/100</Badge>
        <Badge variant="muted">{humanize(a.sentiment)}</Badge>
        {a.urgency === "HIGH" ? <Badge variant="warning">Urgent</Badge> : null}
        {a.escalate ? (
          <Badge variant="warning">
            <AlertTriangle className="size-3" aria-hidden="true" /> Needs a person
          </Badge>
        ) : null}
      </div>
      <p className="text-muted-foreground">{a.summary}</p>
      {a.objections.length > 0 ? (
        <p>
          Objections: {a.objections.map((o) => `${humanize(o.category)} — “${o.text}”`).join("; ")}
        </p>
      ) : null}
      {a.questions.length > 0 ? <p>Questions: {a.questions.join(" ")}</p> : null}
      <p>
        <span className="font-medium">Next: </span>
        {a.nextAction.reason}
      </p>
      {a.suggestedReply ? (
        <details>
          <summary className="cursor-pointer text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Suggested reply
          </summary>
          <p className="mt-2 rounded-md bg-muted/50 p-2 whitespace-pre-line">{a.suggestedReply}</p>
          <div className="mt-2">
            <CopyText text={a.suggestedReply} label="Copy reply" />
          </div>
        </details>
      ) : null}
      <p className="text-xs text-muted-foreground">
        AI analysis · confidence {Math.round(a.confidence * 100)}%
      </p>
    </div>
  );
}

function DraftEditor({
  message,
  canWrite,
  contactable,
}: {
  message: MessageView;
  canWrite: boolean;
  contactable: boolean;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(message.subject ?? "");
  const [content, setContent] = useState(message.content);
  const [busy, setBusy] = useState<string | null>(null);
  const dirty = content !== message.content || subject !== (message.subject ?? "");

  async function act(kind: "save" | "approve" | "discard" | "sent") {
    setBusy(kind);
    try {
      if (dirty || kind !== "sent") {
        await api(`/api/sales/messages/${message.id}`, {
          method: "PATCH",
          body: {
            ...(dirty
              ? { content, subject: message.subject === null && !subject ? null : subject }
              : {}),
            ...(kind === "approve"
              ? { status: "APPROVED" }
              : kind === "discard"
                ? { status: "DISCARDED" }
                : {}),
          },
        });
      }
      if (kind === "sent")
        await api(`/api/sales/messages/${message.id}/sent`, { method: "POST", body: {} });
      toast.success(
        kind === "sent"
          ? "Recorded as sent"
          : kind === "approve"
            ? "Draft approved"
            : kind === "discard"
              ? "Draft discarded"
              : "Draft saved",
      );
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't update the draft.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      {message.subject !== null ? (
        <Input
          aria-label="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={!canWrite}
        />
      ) : null}
      <Textarea
        aria-label="Draft message"
        rows={8}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={!canWrite}
      />
      {message.warnings.length > 0 ? (
        <ul className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning-foreground">
          {message.warnings.map((w) => (
            <li key={w} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
              {w}
            </li>
          ))}
        </ul>
      ) : null}
      {message.draft && message.draft.personalizationSources.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Personalised with:{" "}
          {message.draft.personalizationSources
            .map((s) => `${s.statement} (${s.source ?? s.basis.toLowerCase()})`)
            .join(" · ")}
        </p>
      ) : null}
      {canWrite ? (
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => act("save")}
              loading={busy === "save"}
            >
              Save edits
            </Button>
          ) : null}
          {message.status === "DRAFT" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => act("approve")}
              loading={busy === "approve"}
            >
              <Check /> Approve
            </Button>
          ) : null}
          <CopyText text={`${subject ? `Subject: ${subject}\n\n` : ""}${content}`} />
          {contactable ? (
            <Button size="sm" onClick={() => act("sent")} loading={busy === "sent"}>
              <Send /> I sent it
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => act("discard")}
            loading={busy === "discard"}
          >
            <Trash2 /> Discard
          </Button>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Sending from Cadre arrives with mailbox integration. For now, copy the draft, send it from
        your own email, then click “I sent it”.
      </p>
    </div>
  );
}

function MessageItem({
  message,
  canWrite,
  contactable,
}: {
  message: MessageView;
  canWrite: boolean;
  contactable: boolean;
}) {
  const inbound = message.direction === "INBOUND";
  const isDraft = message.status === "DRAFT" || message.status === "APPROVED";
  return (
    <li
      className={cn(
        "rounded-xl border p-4",
        inbound ? "bg-muted/40" : isDraft ? "border-dashed border-primary/40" : "bg-card",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {inbound ? (
          <ArrowDownLeft className="size-3.5" aria-hidden="true" />
        ) : (
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        )}
        <span className="font-medium text-foreground">
          {inbound
            ? "Received"
            : isDraft
              ? "Draft"
              : message.status === "LOGGED"
                ? `Sent outside ${brand.productName}`
                : message.status === "FAILED"
                  ? "Not sent"
                  : "Sent"}
        </span>
        <span>· {CHANNEL_LABELS[message.channel] ?? message.channel}</span>
        {message.generatedByAi ? <Badge variant="info">AI draft</Badge> : null}
        {message.status === "APPROVED" ? <Badge variant="success">Approved</Badge> : null}
        <span className="ml-auto">{formatDateTime(message.occurredAt)}</span>
      </div>
      {isDraft ? (
        <DraftEditor message={message} canWrite={canWrite} contactable={contactable} />
      ) : (
        <>
          {message.subject ? <p className="text-sm font-medium">{message.subject}</p> : null}
          <p className="text-sm whitespace-pre-line">{message.content}</p>
          {inbound ? <Analysis message={message} /> : null}
        </>
      )}
    </li>
  );
}

function LogMessageDialog({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"INBOUND" | "OUTBOUND">("INBOUND");
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>("EMAIL");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) {
      setError("Paste or type the message.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ applied: string[] }>(`/api/sales/leads/${leadId}/conversations`, {
        method: "POST",
        body: { direction, channel, subject: subject || null, content },
      });
      toast.success(direction === "INBOUND" ? "Reply saved and analysed" : "Message logged", {
        description: res.applied.length ? res.applied.join(" · ") : undefined,
      });
      setOpen(false);
      setContent("");
      setSubject("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the message.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <MessageSquarePlus /> Log message
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log a message</DialogTitle>
          <DialogDescription>
            Record a message exchanged outside Cadre. Replies from the prospect are analysed by
            Sales AI.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormError message={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="msg-direction">Direction</Label>
              <Select
                value={direction}
                onValueChange={(v) => setDirection(v as "INBOUND" | "OUTBOUND")}
              >
                <SelectTrigger id="msg-direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INBOUND">Prospect → us (reply)</SelectItem>
                  <SelectItem value="OUTBOUND">Us → prospect</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="msg-channel">Channel</Label>
              <Select
                value={channel}
                onValueChange={(v) => setChannel(v as (typeof CHANNELS)[number])}
              >
                <SelectTrigger id="msg-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CHANNEL_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {channel === "EMAIL" ? (
            <div className="space-y-1.5">
              <Label htmlFor="msg-subject">Subject (optional)</Label>
              <Input
                id="msg-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="msg-content">Message</Label>
            <Textarea
              id="msg-content"
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {direction === "INBOUND" ? "Save & analyse" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DraftMenu({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" loading={pending}>
          <Sparkles /> Draft with AI
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>What should the AI draft?</DropdownMenuLabel>
        {DRAFT_TYPES.map((t) => (
          <DropdownMenuItem
            key={t.value}
            onSelect={async () => {
              setPending(true);
              try {
                await api(`/api/sales/leads/${leadId}/drafts`, {
                  method: "POST",
                  body: { type: t.value },
                });
                toast.success("Draft ready for your review");
                router.refresh();
              } catch (error) {
                toast.error(
                  error instanceof ApiError ? error.message : "Couldn't generate a draft.",
                );
              } finally {
                setPending(false);
              }
            }}
          >
            {t.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ConversationsPanel({
  leadId,
  conversations,
  canWrite,
  canAi,
  contactable,
}: {
  leadId: string;
  conversations: ConversationView[];
  canWrite: boolean;
  canAi: boolean;
  contactable: boolean;
}) {
  const messages = conversations
    .flatMap((c) => c.messages)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canWrite ? <LogMessageDialog leadId={leadId} /> : null}
        {canAi && contactable ? <DraftMenu leadId={leadId} /> : null}
      </div>
      {messages.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No messages yet.{" "}
          {contactable ? "Draft a first message with AI, or log one you sent elsewhere." : ""}
        </p>
      ) : (
        <ol className="space-y-3">
          {messages.map((m) => (
            <MessageItem key={m.id} message={m} canWrite={canWrite} contactable={contactable} />
          ))}
        </ol>
      )}
    </div>
  );
}
