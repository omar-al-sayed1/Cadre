/**
 * Output guard for everything the interviewer says (spec §26, §32).
 * The model is instructed never to leak internal data; this is the
 * defence-in-depth check before text reaches the candidate.
 */

const LEAK_PATTERNS = [
  /reason_?internal/i,
  /answer_?evaluation/i,
  /"action"\s*:/i,
  /\bexpected topics\b/i,
  /\bideal answer\b/i,
  /\bred flags?\b/i,
  /\bmissing concepts?\b/i,
  /\byou (scored|got a score|earned)\b/i,
  /\byour score\b/i,
  /\bplanner directive\b/i,
  /<\/?(data|transcript|candidate_message|session_configuration|planner_directive|interview_state)\b/i,
];

const MAX_SPOKEN_CHARS = 1_200;

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True if `text` reproduces a contiguous 8-word run of the private ideal answer. */
export function leaksIdealAnswer(text: string, idealAnswers: string[]): boolean {
  const spoken = normalizeForComparison(text);
  for (const ideal of idealAnswers) {
    const words = normalizeForComparison(ideal).split(" ").filter(Boolean);
    for (let i = 0; i + 8 <= words.length; i += 1) {
      if (spoken.includes(words.slice(i, i + 8).join(" "))) return true;
    }
  }
  return false;
}

export interface GuardResult {
  ok: boolean;
  text: string;
  reason?: string;
}

export function guardSpokenText(raw: string, options: { idealAnswers: string[] }): GuardResult {
  let text = raw
    .replace(/<[^>]{1,60}>/g, " ")
    .replace(/[*_#`>]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length === 0) return { ok: false, text, reason: "empty" };
  if (LEAK_PATTERNS.some((pattern) => pattern.test(text)))
    return { ok: false, text, reason: "internal-terminology" };
  if (leaksIdealAnswer(text, options.idealAnswers))
    return { ok: false, text, reason: "ideal-answer-leak" };

  if (text.length > MAX_SPOKEN_CHARS) {
    const cut = text.slice(0, MAX_SPOKEN_CHARS);
    const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
    text = lastStop > 200 ? cut.slice(0, lastStop + 1) : `${cut.trimEnd()}…`;
  }
  return { ok: true, text };
}
