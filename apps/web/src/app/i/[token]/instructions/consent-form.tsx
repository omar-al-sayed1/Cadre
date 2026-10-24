"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { brand } from "@repo/config";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Checkbox } from "@repo/ui/misc";
import { Field, FormError, useFormErrors } from "@/components/forms";
import { api } from "@/lib/api-client";

export function ConsentForm({
  token,
  candidateName,
  emailHint,
  companyName,
  interviewerName,
  recording,
  camera,
  responseMode,
}: {
  token: string;
  candidateName: string;
  emailHint: string;
  companyName: string;
  interviewerName: string;
  recording: boolean;
  /** The company offers an optional self-view camera. */
  camera: boolean;
  responseMode: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(candidateName);
  const [consents, setConsents] = useState({
    aiInterview: false,
    terms: false,
    privacy: false,
    recording: false,
    camera: false,
  });
  const [loading, setLoading] = useState(false);
  const { errors, formError, handleError } = useFormErrors();
  const ready =
    consents.aiInterview &&
    consents.terms &&
    consents.privacy &&
    (!recording || consents.recording) &&
    name.trim().length > 0;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setLoading(true);
    try {
      await api(`/api/i/${token}/begin`, {
        method: "POST",
        body: {
          confirmedName: name,
          consents: {
            terms: true,
            privacy: true,
            aiInterview: true,
            recording: consents.recording,
            camera: camera && consents.camera,
          },
        },
      });
      router.push(
        responseMode === "TEXT_ONLY" ? `/i/${token}/interview` : `/i/${token}/device-check`,
      );
    } catch (error) {
      handleError(error);
      setLoading(false);
    }
  }

  const item = (key: keyof typeof consents, label: React.ReactNode) => (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 text-sm has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50">
      <Checkbox
        checked={consents[key]}
        onCheckedChange={(v) => setConsents({ ...consents, [key]: v === true })}
        className="mt-0.5"
      />
      <span>{label}</span>
    </label>
  );

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-6" noValidate>
      <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Before you begin</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Please confirm your details and review how your interview will be handled.
        </p>
        <div className="mt-6 space-y-4">
          <FormError message={formError} />
          <Field
            label="Your full name"
            htmlFor="confirmedName"
            error={errors.confirmedName}
            hint={`Invitation sent to ${emailHint}`}
          >
            <Input
              id="confirmedName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <h2 className="font-semibold">About this interview</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            {interviewerName} is an AI interviewer. It asks questions and follow-ups on behalf of{" "}
            {companyName}.
          </li>
          <li>
            Your spoken answers are converted to text (transcribed). The transcript is stored for
            the hiring team to review.
          </li>
          <li>
            {recording
              ? "Audio of your answers is recorded and stored."
              : "Audio is not recorded — only the text transcript is kept."}
          </li>
          <li>
            An AI-generated evaluation helps the hiring team review your answers. People at{" "}
            {companyName} make all hiring decisions.
          </li>
          {camera ? (
            <li>
              You can turn on your camera to see yourself, like in a video call. It&apos;s optional:
              video stays on your device and is never recorded, sent or assessed.
            </li>
          ) : null}
          <li>
            Only job-relevant answers are assessed. Your accent, appearance or personal
            characteristics are never scored.
          </li>
          <li>
            Your data is kept according to {companyName}&apos;s retention policy, and you can
            request its deletion.
          </li>
        </ul>
        <div className="mt-5 space-y-2.5">
          {item(
            "aiInterview",
            <>
              I understand this interview is conducted by an AI and that my responses will be
              transcribed and reviewed by the hiring team.
            </>,
          )}
          {recording
            ? item("recording", <>I consent to the audio of my answers being recorded.</>)
            : null}
          {camera
            ? item(
                "camera",
                <>
                  Optional: turn on my camera so I can see myself during the interview (preview
                  only, never recorded).
                </>,
              )
            : null}
          {item(
            "terms",
            <>
              I accept the{" "}
              <Link
                href={brand.legal.termsUrl}
                target="_blank"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                interview terms
              </Link>
              .
            </>,
          )}
          {item(
            "privacy",
            <>
              I have read the{" "}
              <Link
                href={brand.legal.privacyUrl}
                target="_blank"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                privacy notice
              </Link>{" "}
              and agree to the processing of my interview data.
            </>,
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={!ready} loading={loading}>
          Agree and continue
        </Button>
      </div>
    </form>
  );
}
