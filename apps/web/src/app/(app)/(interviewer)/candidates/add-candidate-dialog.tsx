"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { createCandidateSchema } from "@repo/validation";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { toast } from "@repo/ui/sonner";
import { Field, FormError, fieldAria, useFormErrors } from "@/components/forms";
import { api } from "@/lib/api-client";

const EMPTY = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  linkedinUrl: "",
  location: "",
  jobId: "",
};

export function AddCandidateDialog({ jobs }: { jobs: Array<{ id: string; title: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const { errors, formError, validate, handleError } = useFormErrors();

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      ...form,
      jobId: form.jobId || undefined,
      phone: form.phone || null,
      linkedinUrl: form.linkedinUrl || null,
      location: form.location || null,
    };
    if (!validate(createCandidateSchema, payload)) return;
    setSaving(true);
    try {
      const { candidate } = await api<{ candidate: { id: string } }>("/api/candidates", {
        method: "POST",
        body: payload,
      });
      toast.success("Candidate added");
      setOpen(false);
      setForm(EMPTY);
      router.push(`/candidates/${candidate.id}`);
    } catch (error) {
      handleError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Add candidate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a candidate</DialogTitle>
          <DialogDescription>
            Add someone to your pipeline. You can invite them to an interview next.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2" noValidate>
          <div className="sm:col-span-2">
            <FormError message={formError} />
          </div>
          <Field label="First name" htmlFor="c-first" error={errors.firstName} required>
            <Input
              {...fieldAria("c-first", errors, "firstName")}
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            />
          </Field>
          <Field label="Last name" htmlFor="c-last" error={errors.lastName}>
            <Input
              id="c-last"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            />
          </Field>
          <Field
            label="Email"
            htmlFor="c-email"
            error={errors.email}
            required
            className="sm:col-span-2"
          >
            <Input
              {...fieldAria("c-email", errors, "email")}
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Phone" htmlFor="c-phone" error={errors.phone}>
            <Input
              id="c-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="Location" htmlFor="c-location">
            <Input
              id="c-location"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </Field>
          <Field
            label="LinkedIn URL"
            htmlFor="c-linkedin"
            error={errors.linkedinUrl}
            className="sm:col-span-2"
          >
            <Input
              {...fieldAria("c-linkedin", errors, "linkedinUrl")}
              value={form.linkedinUrl}
              onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
              placeholder="https://linkedin.com/in/…"
            />
          </Field>
          <Field label="Add to job" htmlFor="c-job" className="sm:col-span-2">
            <Select
              value={form.jobId || "none"}
              onValueChange={(v) => setForm({ ...form, jobId: v === "none" ? "" : v })}
            >
              <SelectTrigger id="c-job">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No job yet</SelectItem>
                {jobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Add candidate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
