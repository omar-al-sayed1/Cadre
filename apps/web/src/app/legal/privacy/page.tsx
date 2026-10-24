import type { Metadata } from "next";
import { brand, POLICY_VERSIONS } from "@repo/config";

export const metadata: Metadata = { title: "Privacy notice" };

export default function PrivacyPage() {
  return (
    <article>
      <h1>Candidate privacy notice</h1>
      <p>
        Version {POLICY_VERSIONS.privacy}. This notice explains how interview data is handled when
        you complete an interview powered by {brand.productName} on behalf of a hiring company (the
        &ldquo;employer&rdquo;).
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Details the employer provided: your name, email and, optionally, your resume.</li>
        <li>
          Your interview answers, as text. Spoken answers are converted to text (transcribed).
        </li>
        <li>Audio of your answers, only if the employer enabled recording and you consented.</li>
        <li>
          Technical events such as connection drops or switching away from the interview tab, if
          enabled. These are shown to reviewers as context only.
        </li>
        <li>Your consent choices, with the time and policy version.</li>
      </ul>
      <h2>How it is used</h2>
      <p>
        An AI interviewer asks questions and an AI system produces an evaluation of job-relevant
        evidence from your answers. The evaluation supports the employer&apos;s hiring team; people
        at the employer make all hiring decisions. We do not infer or score protected
        characteristics, emotions, appearance or accent.
      </p>
      <h2>Retention and your rights</h2>
      <p>
        Interview data is kept for the period configured by the employer and then deleted. You can
        ask the employer to access, correct or delete your data at any time.
      </p>
      <h2>Contact</h2>
      <p>Contact the employer that invited you, or {brand.supportEmail}.</p>
    </article>
  );
}
