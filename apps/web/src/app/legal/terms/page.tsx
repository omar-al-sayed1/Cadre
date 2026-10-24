import type { Metadata } from "next";
import { brand, POLICY_VERSIONS } from "@repo/config";

export const metadata: Metadata = { title: "Interview terms" };

export default function TermsPage() {
  return (
    <article>
      <h1>Interview terms</h1>
      <p>
        Version {POLICY_VERSIONS.terms}. By starting an interview powered by {brand.productName} you
        agree to the following.
      </p>
      <h2>Your interview</h2>
      <ul>
        <li>
          Answer in your own words. You may ask the interviewer to repeat or clarify questions.
        </li>
        <li>Your invitation link is personal. Please don&apos;t share it.</li>
        <li>You can end the interview at any time; answers given so far may be reviewed.</li>
      </ul>
      <h2>AI assistance</h2>
      <p>
        The interviewer is an AI system. Its evaluation is decision support for the employer&apos;s
        hiring team, who review the evidence and make the decision.
      </p>
      <h2>Accessibility</h2>
      <p>
        If the voice format doesn&apos;t work for you, use the text option where available, or
        contact the employer to request an accommodation.
      </p>
    </article>
  );
}
