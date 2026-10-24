"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  MoreHorizontal,
  RefreshCw,
  Send,
  ShieldAlert,
  Star,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { MANUAL_CANDIDATE_STAGES, type CandidateStage } from "@repo/shared";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/dropdown-menu";
import { Input, Textarea } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Checkbox } from "@repo/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { toast } from "@repo/ui/sonner";
import { api, ApiError } from "@/lib/api-client";
import { formatRelative, STAGE_LABELS } from "@/lib/format";
import { CopyField } from "../invite-dialog";

function errorToast(error: unknown) {
  toast.error(error instanceof ApiError ? error.message : "Something went wrong.");
}

export function StageSelect({
  applicationId,
  stage,
  disabled,
}: {
  applicationId: string;
  stage: CandidateStage;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState<CandidateStage>(stage);
  const manual = MANUAL_CANDIDATE_STAGES as readonly string[];
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={async (next) => {
        const previous = value;
        setValue(next as CandidateStage);
        try {
          await api(`/api/applications/${applicationId}/stage`, {
            method: "POST",
            body: { stage: next },
          });
          toast.success(`Moved to ${STAGE_LABELS[next as CandidateStage]}`);
          router.refresh();
        } catch (error) {
          setValue(previous);
          errorToast(error);
        }
      }}
    >
      <SelectTrigger className="w-44" size="sm" aria-label="Pipeline stage">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {!manual.includes(stage) ? (
          <SelectItem value={stage} disabled>
            {STAGE_LABELS[stage]}
          </SelectItem>
        ) : null}
        {MANUAL_CANDIDATE_STAGES.map((s) => (
          <SelectItem key={s} value={s}>
            {STAGE_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RatingInput({
  applicationId,
  rating,
  disabled,
}: {
  applicationId: string;
  rating: number | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(rating);
  return (
    <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Manual rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          disabled={disabled}
          className="rounded p-0.5 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
          onClick={async () => {
            const next = value === n ? null : n;
            setValue(next);
            try {
              await api(`/api/applications/${applicationId}/rating`, {
                method: "POST",
                body: { rating: next },
              });
              router.refresh();
            } catch (error) {
              errorToast(error);
            }
          }}
        >
          <Star
            className={cn(
              "size-4",
              value !== null && n <= value ? "fill-warning text-warning" : "text-muted-foreground",
            )}
          />
        </button>
      ))}
    </div>
  );
}

export function InvitationActions({
  invitationId,
  status,
}: {
  invitationId: string;
  status: string;
}) {
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null);
  if (status === "COMPLETED" || status === "CANCELLED") return null;
  const resend = async (sendEmail: boolean) => {
    try {
      const { url } = await api<{ url: string }>(`/api/invitations/${invitationId}/resend`, {
        method: "POST",
        body: { sendEmail },
      });
      setLink(url);
      toast.success(sendEmail ? "Invitation resent" : "New link generated");
      router.refresh();
    } catch (error) {
      errorToast(error);
    }
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Invitation actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => resend(true)}>
            <Send /> Resend email
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => resend(false)}>
            <RefreshCw /> Generate new link
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={async () => {
              try {
                await api(`/api/invitations/${invitationId}/cancel`, { method: "POST", body: {} });
                toast.success("Invitation cancelled");
                router.refresh();
              } catch (error) {
                errorToast(error);
              }
            }}
          >
            <XCircle /> Cancel invitation
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={link !== null} onOpenChange={(o) => !o && setLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New interview link</DialogTitle>
            <DialogDescription>The previous link no longer works.</DialogDescription>
          </DialogHeader>
          {link ? <CopyField value={link} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ResumeUpload({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  return (
    <>
      <input
        ref={input}
        type="file"
        className="sr-only"
        aria-label="Choose resume file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > 10 * 1024 * 1024) {
            toast.error("Resumes must be smaller than 10 MB.");
            return;
          }
          setLoading(true);
          try {
            const form = new FormData();
            form.append("file", file);
            await api(`/api/candidates/${candidateId}/resume`, { method: "POST", body: form });
            toast.success("Resume uploaded — parsing in the background");
            router.refresh();
          } catch (error) {
            errorToast(error);
          } finally {
            setLoading(false);
            e.target.value = "";
          }
        }}
      />
      <Button variant="outline" size="sm" loading={loading} onClick={() => input.current?.click()}>
        <Upload /> Upload resume
      </Button>
    </>
  );
}

export interface NoteView {
  id: string;
  content: string;
  createdAt: string;
  author: { name: string };
}

export function NotesPanel({
  candidateId,
  notes,
  canWrite,
  sessionId,
  applicationId,
}: {
  candidateId: string;
  notes: NoteView[];
  canWrite: boolean;
  sessionId?: string;
  applicationId?: string;
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <div className="space-y-4">
      {canWrite ? (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!content.trim()) return;
            setSaving(true);
            try {
              await api(`/api/candidates/${candidateId}/notes`, {
                method: "POST",
                body: { content, sessionId, applicationId },
              });
              setContent("");
              router.refresh();
            } catch (error) {
              errorToast(error);
            } finally {
              setSaving(false);
            }
          }}
        >
          <Label htmlFor="note" className="sr-only">
            Add a private note
          </Label>
          <Textarea
            id="note"
            rows={3}
            placeholder="Add a private note for your team (never visible to the candidate)…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={saving} disabled={!content.trim()}>
              Add note
            </Button>
          </div>
        </form>
      ) : null}
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg border bg-muted/30 p-3">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{n.author.name}</span>
                <span>{formatRelative(n.createdAt)}</span>
              </div>
              <p className="text-sm whitespace-pre-line">{n.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PrivacyDeletionButton({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState({
    candidate: false,
    resume: false,
    transcript: false,
    audio: false,
    evaluation: false,
  });
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const labels: Record<keyof typeof scope, string> = {
    candidate: "Everything (anonymise the candidate)",
    resume: "Resume files",
    transcript: "Interview transcripts",
    audio: "Audio recordings",
    evaluation: "AI evaluations",
  };
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <ShieldAlert /> Delete data
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete candidate data</DialogTitle>
            <DialogDescription>
              For privacy requests. Deletion is permanent and recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(Object.keys(scope) as Array<keyof typeof scope>).map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={scope[key]}
                  onCheckedChange={(v) => setScope({ ...scope, [key]: v === true })}
                />
                {labels[key]}
              </label>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-delete">
              Type <span className="font-mono">DELETE</span> to confirm
            </Label>
            <Input
              id="confirm-delete"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={loading}
              disabled={confirmation !== "DELETE" || !Object.values(scope).some(Boolean)}
              onClick={async () => {
                setLoading(true);
                try {
                  await api(`/api/candidates/${candidateId}/privacy`, {
                    method: "POST",
                    body: { scope, confirmation },
                  });
                  toast.success("Deletion scheduled");
                  setOpen(false);
                  router.refresh();
                } catch (error) {
                  errorToast(error);
                } finally {
                  setLoading(false);
                }
              }}
            >
              <Trash2 /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
