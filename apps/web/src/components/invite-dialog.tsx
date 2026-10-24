"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Copy, Link2, Send, UserPlus } from "lucide-react";
import { createInvitationSchema } from "@repo/validation";
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
import { Input } from "@repo/ui/input";
import { Switch } from "@repo/ui/misc";
import { Label } from "@repo/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { toast } from "@repo/ui/sonner";
import { Field, FormError, fieldAria, useFormErrors } from "@/components/forms";
import { api } from "@/lib/api-client";

export interface InviteTemplateOption {
  id: string;
  name: string;
  durationMinutes: number;
}

export function CopyField({ value, label = "Interview link" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor="invite-link">{label}</Label>
      <div className="flex gap-2">
        <Input
          id="invite-link"
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="font-mono text-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Copy link"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            toast.success("Link copied");
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </div>
  );
}

export function InviteDialog({
  templates,
  candidate,
  defaultOpen = false,
  trigger,
}: {
  templates: InviteTemplateOption[];
  candidate?: { id: string; name: string };
  defaultOpen?: boolean;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [person, setPerson] = useState({ firstName: "", lastName: "", email: "" });
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [sendEmail, setSendEmail] = useState(true);
  const [saving, setSaving] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const { errors, formError, validate, handleError, clear } = useFormErrors();

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setLink(null);
      clear();
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      templateId,
      ...(candidate ? { candidateId: candidate.id } : { candidate: person }),
      expiresInDays,
      sendEmail,
    };
    if (!validate(createInvitationSchema, payload)) return;
    setSaving(true);
    try {
      const result = await api<{ url: string }>("/api/invitations", {
        method: "POST",
        body: payload,
      });
      setLink(result.url);
      toast.success(sendEmail ? "Invitation sent" : "Interview link created");
      router.refresh();
    } catch (error) {
      handleError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button disabled={templates.length === 0}>
            <UserPlus /> Invite candidate
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{candidate ? `Invite ${candidate.name}` : "Invite a candidate"}</DialogTitle>
          <DialogDescription>
            The candidate receives a personal, secure link. Only a hash of the link is stored.
          </DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="space-y-4">
            <CopyField value={link} />
            <p className="text-xs text-muted-foreground">
              <Link2 className="mr-1 inline size-3.5" aria-hidden="true" />
              This link is shown once. If it&apos;s lost, use &ldquo;Resend&rdquo; on the
              candidate&apos;s page to generate a new one.
            </p>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setLink(null);
                  setPerson({ firstName: "", lastName: "", email: "" });
                }}
              >
                Invite another
              </Button>
              <Button onClick={() => changeOpen(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormError message={formError} />
            <Field label="Interview" htmlFor="templateId" error={errors.templateId}>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger id="templateId">
                  <SelectValue placeholder="Select a published interview" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} · {t.durationMinutes} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {!candidate ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="First name"
                  htmlFor="firstName"
                  error={errors["candidate.firstName"]}
                  required
                >
                  <Input
                    {...fieldAria("firstName", errors, "candidate.firstName")}
                    value={person.firstName}
                    onChange={(e) => setPerson({ ...person, firstName: e.target.value })}
                  />
                </Field>
                <Field label="Last name" htmlFor="lastName" error={errors["candidate.lastName"]}>
                  <Input
                    id="lastName"
                    value={person.lastName}
                    onChange={(e) => setPerson({ ...person, lastName: e.target.value })}
                  />
                </Field>
                <Field
                  label="Email"
                  htmlFor="email"
                  error={errors["candidate.email"]}
                  required
                  className="sm:col-span-2"
                >
                  <Input
                    {...fieldAria("email", errors, "candidate.email")}
                    type="email"
                    value={person.email}
                    onChange={(e) => setPerson({ ...person, email: e.target.value })}
                  />
                </Field>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Link expires after" htmlFor="expires">
                <Select
                  value={String(expiresInDays)}
                  onValueChange={(v) => setExpiresInDays(Number(v))}
                >
                  <SelectTrigger id="expires">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[3, 5, 7, 14, 30].map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} days
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex items-end gap-3 pb-1.5">
                <Switch id="sendEmail" checked={sendEmail} onCheckedChange={setSendEmail} />
                <Label htmlFor="sendEmail">Email the invitation</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => changeOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                <Send /> {sendEmail ? "Send invitation" : "Create link"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
