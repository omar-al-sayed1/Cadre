/**
 * Prompt-injection hygiene.
 *
 * Untrusted content (candidate answers, resumes, job descriptions written by
 * recruiters, transcripts) is always wrapped in a tagged data block. Any text
 * that could close or open one of our structural tags is neutralised so content
 * can never "escape" its block and masquerade as instructions.
 */

const STRUCTURAL_TAGS = [
  "system",
  "instructions",
  "session_configuration",
  "data",
  "resume",
  "transcript",
  "candidate_message",
  "interview_state",
  "current_question",
  "planner_directive",
  "rubric",
  "answers",
  "thread",
] as const;

const TAG_PATTERN = new RegExp(`<\\s*/?\\s*(${STRUCTURAL_TAGS.join("|")})\\b[^>]*>`, "gi");

export function neutralizeStructuralTags(text: string): string {
  return text.replace(TAG_PATTERN, (match) => match.replace(/</g, "‹").replace(/>/g, "›"));
}

/** Strip control characters (except newlines/tabs) that can confuse tokenisation or logs. */
export function stripControlChars(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

export function sanitizeUntrusted(text: string, maxChars = 12_000): string {
  const cleaned = neutralizeStructuralTags(stripControlChars(text));
  return cleaned.length > maxChars ? `${cleaned.slice(0, maxChars)}\n[truncated]` : cleaned;
}

/** Wrap untrusted content in a data block the model is told never to obey. */
export function dataBlock(source: string, content: string, maxChars?: number): string {
  return `<data source="${source}" trust="untrusted">\n${sanitizeUntrusted(content, maxChars)}\n</data>`;
}

export function taggedBlock(tag: (typeof STRUCTURAL_TAGS)[number], content: string): string {
  return `<${tag}>\n${content}\n</${tag}>`;
}

const INJECTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|all|your|the)\b[^.\n]{0,30}\b(instructions?|rules?|prompts?|directions?)\b/i,
  /\b(system|developer|hidden|initial)\s+(prompt|instructions?|message)\b/i,
  /\b(reveal|show|tell me|print|repeat|output)\b[^.\n]{0,40}\b(prompt|instructions|rubric|scoring|score|ideal answer|expected answer|evaluation)\b/i,
  /\byou are now\b|\bact as (an? )?(unrestricted|different|new)\b|\bjailbreak\b|\bdeveloper mode\b|\bDAN\b/i,
  /\b(give|award|assign|rate)\b[^.\n]{0,30}\b(100\s*%?|full marks|perfect score|maximum score|top score|highest score)\b/i,
  /\bnew instructions?\s*:/i,
];

/** Heuristic detector used for deterministic handling and auditing (the model is also instructed). */
export function detectPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}
