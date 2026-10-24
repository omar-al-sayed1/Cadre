import type { AnswerEvaluation, CandidateIntent, StarCompleteness } from "../schemas";
import { detectPromptInjection } from "../prompts/safety";
import type { CurrentQuestionContext } from "../service/types";

/**
 * Deterministic text heuristics shared by the demo interviewer. They are
 * intentionally simple and transparent — good enough to drive a realistic demo
 * and to serve as test fixtures, never a substitute for the real model.
 */

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "is",
  "are",
  "be",
  "it",
  "that",
  "this",
  "as",
  "at",
  "by",
  "from",
  "vs",
  "how",
  "what",
  "why",
  "when",
  "your",
  "you",
  "their",
  "use",
]);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function words(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

function stem(word: string): string {
  return word.replace(/(ing|ed|es|s)$/u, "");
}

/** True when any significant word of the topic appears in the answer. */
export function mentionsTopic(answer: string, topic: string): boolean {
  const answerStems = new Set(words(answer).map(stem));
  const topicWords = words(topic).filter((w) => !STOP_WORDS.has(w) && w.length > 2);
  if (topicWords.length === 0) return false;
  const hits = topicWords.filter((w) => answerStems.has(stem(w))).length;
  return hits >= Math.max(1, Math.ceil(topicWords.length / 2));
}

const DONT_KNOW =
  /\b(i\s*(do\s*n[o']?t|dont|really\s+don'?t)\s*know|no idea|not (completely |really |entirely |quite |too )?sure|i'?m not (very |that |too )?familiar|never (used|worked with|heard)|haven'?t (used|worked)|can'?t remember|i have no experience|need to look (it|that) up)\b/i;
const REPEAT =
  /\b(repeat|say (that|it) again|come again|didn'?t (hear|catch)|slower|one more time|pardon)\b/i;
const CLARIFY =
  /\b(what do you mean|clarify|could you explain the question|rephrase|not sure what you('| a)re asking|what exactly)\b/i;
const HINT =
  /\b(hint|give me the answer|what('| i)s the (correct|right) answer|tell me the answer)\b/i;
const END =
  /\b(end|stop|finish|quit|terminate)\b.{0,20}\b(interview|this|now|here)\b|\bi want to (leave|stop)\b/i;
const READY =
  /\b(yes|yeah|yep|ready|sure|ok(ay)?|of course|let'?s (go|start|begin)|i can hear you|loud and clear|hello|hi)\b/i;
const LANGUAGE =
  /\b(speak|switch|continue|interview)\b.{0,20}\b(arabic|french|spanish|english|in my language)\b/i;
const QUESTION_MARK = /\?\s*$/;

export function classifyIntent(
  message: string,
  currentQuestion: CurrentQuestionContext | null,
  closing: boolean,
): CandidateIntent {
  const text = message.trim();
  const count = words(text).length;
  if (count === 0 || /^[^a-z0-9]+$/i.test(text)) return "UNCLEAR";
  if (detectPromptInjection(text)) return "PROMPT_INJECTION";
  if (END.test(text) && count <= 20) return "END_REQUEST";
  if (LANGUAGE.test(text) && count <= 25) return "LANGUAGE_REQUEST";
  if (HINT.test(text) && count <= 25) return "HINT_REQUEST";
  if (REPEAT.test(text) && count <= 20) return "REPEAT_REQUEST";
  if (CLARIFY.test(text) && count <= 25) return "CLARIFICATION_REQUEST";
  if (!currentQuestion) return READY.test(text) || count > 0 ? "ANSWER" : "UNCLEAR";
  if (DONT_KNOW.test(text) && count <= 25) return "DONT_KNOW";
  if (closing && QUESTION_MARK.test(text)) return "CANDIDATE_QUESTION";
  if (count < 3) return "UNCLEAR";
  return "ANSWER";
}

const STAR_PATTERNS: Record<keyof StarCompleteness, RegExp> = {
  situation: /\b(when|while|at my|in my (last|previous)|project|team|company|situation|once)\b/i,
  task: /\b(needed to|had to|my (task|job|role|responsibility)|responsible|goal|asked to|deadline)\b/i,
  action:
    /\bi (decided|implemented|built|wrote|talked|spoke|organized|organised|proposed|set up|created|refactored|investigated|fixed|led|scheduled|reached out|suggested|analy[sz]ed)\b/i,
  result:
    /\b(result|outcome|in the end|eventually|finally|as a result|reduced|improved|increased|delivered|shipped|resolved|learned|learnt)\b|\d+\s*%/i,
};

export function detectStar(answer: string): StarCompleteness {
  return {
    situation: STAR_PATTERNS.situation.test(answer),
    task: STAR_PATTERNS.task.test(answer),
    action: STAR_PATTERNS.action.test(answer),
    result: STAR_PATTERNS.result.test(answer),
  };
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

export function extractFacts(answer: string, skillNames: string[]): string[] {
  const facts = new Set<string>();
  const yearPattern =
    /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s*(\+\s*)?years?\s+(of\s+|with\s+|in\s+|using\s+)?([A-Za-z][\w+#.\s-]{1,30}?)(?=[,.;]|\s+(and|mainly|mostly|in|at|for)\b|$)/gi;
  for (const match of answer.matchAll(yearPattern)) {
    const raw = match[1]?.toLowerCase() ?? "";
    const years = NUMBER_WORDS[raw] ?? Number.parseInt(raw, 10);
    const subject = (match[4] ?? "").trim();
    if (Number.isFinite(years) && subject.length > 1)
      facts.add(`${years} year${years === 1 ? "" : "s"} of ${subject} experience`);
  }
  const usedForPattern =
    /\b(?:used|worked with|been (?:using|working with)|coded in|programmed in|programming in|experience (?:with|in))\s+([A-Za-z][\w+#.-]*(?:\s+[A-Z][\w+#.-]*)?)\s+for\s+(?:around|about|over|nearly|almost|roughly|approximately)?\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:\+\s*)?years?/gi;
  for (const match of answer.matchAll(usedForPattern)) {
    const raw = match[2]?.toLowerCase() ?? "";
    const years = NUMBER_WORDS[raw] ?? Number.parseInt(raw, 10);
    const subject = (match[1] ?? "").trim();
    if (Number.isFinite(years) && subject.length > 1)
      facts.add(`${years} year${years === 1 ? "" : "s"} of ${subject} experience`);
  }
  const builtPattern =
    /\bi\s+(built|created|developed|designed|implemented|worked on|led|maintained)\s+([^.;!?]{5,200})/gi;
  for (const match of answer.matchAll(builtPattern)) {
    let detail = (match[2] ?? "").trim();
    const comma = detail.indexOf(",");
    if (comma > 15) detail = detail.slice(0, comma);
    if (detail.length > 110) detail = detail.slice(0, 110).replace(/\s+\S*$/, "");
    facts.add(`${match[1]} ${detail}`);
  }
  const lower = answer.toLowerCase();
  for (const skill of skillNames) {
    if (skill.length > 1 && lower.includes(skill.toLowerCase()))
      facts.add(`mentioned using ${skill}`);
  }
  return [...facts].slice(0, 6);
}

export function heuristicEvaluation(
  answer: string,
  question: CurrentQuestionContext,
  intent: CandidateIntent,
  skillNames: string[],
): AnswerEvaluation {
  const count = words(answer).length;
  if (intent === "DONT_KNOW") {
    return {
      answerSummary: "The candidate said they were not familiar with this topic.",
      score: 10,
      confidence: 0.4,
      demonstratedConcepts: [],
      missingConcepts: question.expectedTopics.slice(0, 8),
      incorrectClaims: [],
      needsFollowUp: false,
      followUpObjective: null,
      star: null,
      candidateFacts: [],
    };
  }

  const topics = question.expectedTopics;
  const demonstrated = topics.filter((t) => mentionsTopic(answer, t));
  const missing = topics.filter((t) => !demonstrated.includes(t));
  const coverage =
    topics.length > 0 ? demonstrated.length / topics.length : Math.min(1, count / 80);
  const lengthFactor = Math.min(1, count / 70);
  const star = question.isBehavioral ? detectStar(answer) : null;
  const starScore = star ? Object.values(star).filter(Boolean).length / 4 : null;

  let score = 22 + 50 * (starScore ?? coverage) + 23 * lengthFactor;
  if (count < 8) score = Math.min(score, 35);
  if (question.type === "INTRODUCTION" || question.type === "CLOSING")
    score = Math.max(score, 45 + 30 * lengthFactor);
  score = Math.round(Math.max(5, Math.min(95, score)));

  const confidence =
    Math.round(Math.min(0.85, 0.3 + 0.4 * lengthFactor + 0.15 * coverage) * 100) / 100;
  const starGap = star ? (Object.entries(star).find(([, present]) => !present)?.[0] ?? null) : null;
  const needsFollowUp =
    question.type !== "CLOSING" && (star ? starGap !== null : coverage < 0.6 || count < 25);

  const firstMissing = missing[0];
  return {
    answerSummary: summarize(answer),
    score,
    confidence,
    demonstratedConcepts: demonstrated.slice(0, 12),
    missingConcepts: missing.slice(0, 12),
    incorrectClaims: [],
    needsFollowUp,
    followUpObjective: needsFollowUp
      ? starGap
        ? `Clarify the ${starGap} of the example`
        : firstMissing
          ? `Probe understanding of ${firstMissing}`
          : "Ask for a concrete example"
      : null,
    star,
    candidateFacts: extractFacts(answer, skillNames),
  };
}

/** Jaccard similarity of significant words — used to avoid near-duplicate questions. */
export function similarity(a: string, b: string): number {
  const set = (text: string) =>
    new Set(
      words(text)
        .filter((w) => !STOP_WORDS.has(w) && w.length > 2)
        .map(stem),
    );
  const sa = set(a);
  const sb = set(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let intersection = 0;
  for (const w of sa) if (sb.has(w)) intersection += 1;
  return intersection / (sa.size + sb.size - intersection);
}

export function isNearDuplicate(text: string, others: string[], threshold = 0.45): boolean {
  return others.some((other) => similarity(text, other) >= threshold);
}

export function summarize(answer: string, maxWords = 40): string {
  const all = answer.trim().split(/\s+/);
  const text = all.slice(0, maxWords).join(" ");
  return all.length > maxWords ? `${text}…` : text;
}
