import { LIMITS } from "@repo/config";
import type {
  CompletionReason,
  InterviewAction,
  QuestionDifficulty,
  QuestionType,
} from "@repo/shared";
import type { ParsedResume } from "@repo/ai";
import { evidenceCeiling } from "@repo/scoring";
import { difficultyDistance } from "./difficulty";
import type { EngineMemory } from "./memory";
import {
  isClosingSection,
  orderedSections,
  sectionQuestions,
  sectionSkillKeys,
  type SnapshotQuestion,
  type SnapshotSection,
  type TemplateSnapshot,
} from "./snapshot";

/**
 * Deterministic interview planner (spec §22, §46, §106–§108).
 *
 * The planner decides *what is allowed and what comes next*; the model decides
 * *how to say it* and judges answer quality within those constraints. The model
 * is never asked an unconstrained "what should I ask next?".
 */

export type TimingPhase = "NORMAL" | "WRAP_UP" | "OVERTIME";

export type PlannedNext =
  | {
      kind: "BANK";
      question: SnapshotQuestion;
      section: SnapshotSection;
      sectionIndex: number;
      isNewSection: boolean;
    }
  | {
      kind: "GENERATE";
      skillKey: string | null;
      type: QuestionType;
      difficulty: QuestionDifficulty;
      section: SnapshotSection;
      sectionIndex: number;
      isNewSection: boolean;
      resumeHook: string | null;
    }
  | { kind: "CLOSING"; askAnythingToAdd: boolean }
  | { kind: "END"; reason: CompletionReason };

export interface Plan {
  timing: {
    elapsedSeconds: number;
    remainingSeconds: number;
    totalSeconds: number;
    phase: TimingPhase;
  };
  hardStop: boolean;
  followUpAllowed: boolean;
  followUpsRemaining: number;
  next: PlannedNext;
  allowedActions: InterviewAction[];
  notes: string[];
  /** Skill priorities at planning time (diagnostics). */
  priorities: Array<{ skillKey: string; priority: number }>;
}

export interface PlannerInput {
  snapshot: TemplateSnapshot;
  memory: EngineMemory;
  elapsedSeconds: number;
  resume: ParsedResume | null;
}

const CLOSING_RESERVE_SECONDS = 60;
const SECONDS_PER_QUESTION = 120;

export function computeTiming(snapshot: TemplateSnapshot, elapsedSeconds: number) {
  const totalSeconds = snapshot.durationMinutes * 60;
  const remainingSeconds = totalSeconds - elapsedSeconds;
  const phase: TimingPhase =
    remainingSeconds <= 0
      ? "OVERTIME"
      : elapsedSeconds >= totalSeconds * LIMITS.interview.wrapUpAtFraction
        ? "WRAP_UP"
        : "NORMAL";
  const hardStop =
    (snapshot.aiSettings.strictTimeLimit && remainingSeconds <= 0) ||
    remainingSeconds <= -LIMITS.interview.overtimeGraceSeconds;
  return { totalSeconds, remainingSeconds, elapsedSeconds, phase, hardStop };
}

/** priority ≈ importance × evidence gap × uncertainty (spec §107). */
export function skillPriority(
  snapshot: TemplateSnapshot,
  memory: EngineMemory,
  skillKey: string,
): number {
  const skill = snapshot.skills.find((s) => s.key === skillKey);
  const evidence = memory.skills[skillKey];
  if (!skill || !evidence) return 0;
  if (evidence.coverage >= 1 && evidence.confidence >= 0.75) return 0; // sufficiently evaluated
  const totalWeight = snapshot.skills.reduce((sum, s) => sum + s.weight, 0);
  const importance =
    (totalWeight > 0 ? skill.weight / totalWeight : 1 / snapshot.skills.length) *
    (skill.critical ? 1.5 : 1);
  const evidenceGap = 1 - evidence.coverage;
  const uncertainty = Math.max(0.2, 1 - evidence.confidence * 0.8);
  return Math.round(importance * (0.15 + evidenceGap) * uncertainty * 10_000) / 10_000;
}

function isAsked(memory: EngineMemory, question: SnapshotQuestion): boolean {
  return memory.askedQuestionKeys.includes(question.key);
}

function dominantType(snapshot: TemplateSnapshot, section: SnapshotSection): QuestionType {
  const counts = new Map<QuestionType, number>();
  for (const q of sectionQuestions(snapshot, section.key)) {
    if (q.type === "FOLLOW_UP" || q.type === "CLOSING") continue;
    counts.set(q.type, (counts.get(q.type) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (top) return top;
  if (snapshot.type === "BEHAVIORAL" || snapshot.type === "HR") return "BEHAVIORAL";
  return "TECHNICAL";
}

/** Find a resume detail relevant to a skill for a personalised question (spec §14). */
export function findResumeHook(
  resume: ParsedResume | null,
  skillName: string,
  used: string[],
): string | null {
  if (!resume) return null;
  const needle = skillName.toLowerCase();
  const matches = (text: string) => text.toLowerCase().includes(needle);
  const candidates: string[] = [];
  for (const project of resume.projects) {
    if (matches(`${project.name} ${project.description} ${project.technologies.join(" ")}`)) {
      candidates.push(
        `the "${project.name}" project${project.description ? ` (${project.description})` : ""}`,
      );
    }
  }
  for (const role of resume.experience) {
    if (
      matches(`${role.title} ${role.company} ${role.description} ${role.technologies.join(" ")}`)
    ) {
      candidates.push(
        `your work as ${role.title}${role.company ? ` at ${role.company}` : ""}${role.description ? ` (${role.description})` : ""}`,
      );
    }
  }
  const hook = candidates
    .map((c) => (c.length > 220 ? `${c.slice(0, 217)}…` : c))
    .find((c) => !used.includes(c));
  return hook ?? null;
}

interface SectionContext {
  input: PlannerInput;
  remainingSeconds: number;
}

/** Time to reserve for sections after `index` (so earlier sections can't starve later ones). */
function reserveAfter(ctx: SectionContext, sections: SnapshotSection[], index: number): number {
  let reserve = CLOSING_RESERVE_SECONDS;
  for (const section of sections.slice(index + 1)) {
    if (isClosingSection(ctx.input.snapshot, section)) continue;
    reserve += Math.min(
      section.targetDurationSeconds,
      Math.max(1, section.minQuestions) * SECONDS_PER_QUESTION,
    );
  }
  return reserve;
}

function sectionDone(ctx: SectionContext, sections: SnapshotSection[], index: number): boolean {
  const { snapshot, memory, elapsedSeconds } = ctx.input;
  const section = sections[index]!;
  const state = memory.sections[index];
  if (!state) return true;
  if (state.completed) return true;
  const asked = state.questionsAsked;
  const timeIn = state.startedAtSeconds === null ? 0 : elapsedSeconds - state.startedAtSeconds;
  const mandatoryPending = sectionQuestions(snapshot, section.key).some(
    (q) => q.mandatory && !isAsked(memory, q),
  );

  if (asked >= section.maxQuestions) return true;
  if (mandatoryPending) return false;
  if (asked >= section.minQuestions && timeIn >= section.targetDurationSeconds) return true;
  if (asked >= 1 && timeIn >= section.targetDurationSeconds * 1.5) return true;
  if (
    asked >= Math.max(1, section.minQuestions) &&
    ctx.remainingSeconds - reserveAfter(ctx, sections, index) < 60
  )
    return true;

  const skillKeys = sectionSkillKeys(snapshot, section);
  if (
    asked >= section.minQuestions &&
    skillKeys.length > 0 &&
    skillKeys.every((k) => skillPriority(snapshot, memory, k) === 0)
  ) {
    return true;
  }
  return false;
}

function pickInSection(
  ctx: SectionContext,
  section: SnapshotSection,
  sectionIndex: number,
  isNewSection: boolean,
): PlannedNext | null {
  const { snapshot, memory, resume } = ctx.input;
  const settings = snapshot.aiSettings;
  const available = sectionQuestions(snapshot, section.key).filter(
    (q) => !isAsked(memory, q) && q.type !== "CLOSING",
  );

  const mandatory = available.find((q) => q.mandatory);
  if (mandatory) return { kind: "BANK", question: mandatory, section, sectionIndex, isNewSection };

  const skillKeys = sectionSkillKeys(snapshot, section);
  const ranked = skillKeys
    .map((skillKey) => ({ skillKey, priority: skillPriority(snapshot, memory, skillKey) }))
    .filter((s) => s.priority > 0)
    .sort((a, b) => b.priority - a.priority);

  for (const { skillKey } of ranked) {
    const evidence = memory.skills[skillKey]!;
    const skill = snapshot.skills.find((s) => s.key === skillKey)!;

    // Personalised, resume-anchored question the first time a skill comes up.
    if (
      settings.resumeQuestions &&
      settings.allowDynamicQuestions &&
      evidence.evidence.length === 0 &&
      memory.resumeHooksUsed.length < 2
    ) {
      const hook = findResumeHook(resume, skill.name, memory.resumeHooksUsed);
      if (hook) {
        return {
          kind: "GENERATE",
          skillKey,
          type: "EXPERIENCE",
          difficulty: evidence.targetDifficulty,
          section,
          sectionIndex,
          isNewSection,
          resumeHook: hook,
        };
      }
    }

    const bank = available
      .filter((q) => q.skillKey === skillKey)
      .sort(
        (a, b) =>
          difficultyDistance(a.difficulty, evidence.targetDifficulty) -
            difficultyDistance(b.difficulty, evidence.targetDifficulty) || a.order - b.order,
      )[0];
    if (bank) return { kind: "BANK", question: bank, section, sectionIndex, isNewSection };

    if (settings.allowDynamicQuestions) {
      return {
        kind: "GENERATE",
        skillKey,
        type: dominantType(snapshot, section),
        difficulty: evidence.targetDifficulty,
        section,
        sectionIndex,
        isNewSection,
        resumeHook: null,
      };
    }
  }

  const general =
    available.find((q) => q.skillKey === null) ?? (ranked.length === 0 ? available[0] : undefined);
  if (general) return { kind: "BANK", question: general, section, sectionIndex, isNewSection };

  const state = memory.sections[sectionIndex];
  if (
    settings.allowDynamicQuestions &&
    skillKeys.length === 0 &&
    (state?.questionsAsked ?? 0) < Math.max(1, section.minQuestions)
  ) {
    return {
      kind: "GENERATE",
      skillKey: null,
      type: dominantType(snapshot, section),
      difficulty: "MEDIUM",
      section,
      sectionIndex,
      isNewSection,
      resumeHook: null,
    };
  }
  return null;
}

function closingStep(input: PlannerInput): PlannedNext {
  const s = input.snapshot.aiSettings;
  const ask = (s.askAnythingToAdd || s.candidateQuestionsAtEnd) && !input.memory.closingAsked;
  return ask ? { kind: "CLOSING", askAnythingToAdd: true } : { kind: "END", reason: "NORMAL" };
}

export function selectNext(
  input: PlannerInput,
  remainingSeconds: number,
  phase: TimingPhase,
): PlannedNext {
  const { snapshot, memory } = input;
  if (phase !== "NORMAL") return closingStep(input);
  if (memory.primaryQuestionsAsked >= snapshot.maxQuestions) return closingStep(input);

  const sections = orderedSections(snapshot);
  const ctx: SectionContext = { input, remainingSeconds };
  for (let i = memory.sectionIndex; i < sections.length; i += 1) {
    const section = sections[i]!;
    if (isClosingSection(snapshot, section)) return closingStep(input);
    const state = memory.sections[i];
    // The very first question isn't a "transition", even though its section is new.
    const isNewSection =
      memory.primaryQuestionsAsked > 0 &&
      (i !== memory.sectionIndex ||
        state?.startedAtSeconds === null ||
        state?.startedAtSeconds === undefined);
    if (!isNewSection && sectionDone(ctx, sections, i)) continue;
    const picked = pickInSection(ctx, section, i, isNewSection);
    if (picked) return picked;
  }
  return closingStep(input);
}

/**
 * The model evaluates the pending answer and phrases the next step in a single
 * call, so the next step must be chosen before that answer's evidence exists.
 * We plan against a projection in which the pending answer adds moderate
 * evidence to its skill; the following turn re-plans with the real evaluation.
 */
export function projectPendingAnswer(memory: EngineMemory): EngineMemory {
  const current = memory.current;
  if (!current?.skillKey || memory.phase !== "QUESTIONING") return memory;
  const skill = memory.skills[current.skillKey];
  if (!skill) return memory;
  const projected = structuredClone(memory);
  const target = projected.skills[current.skillKey]!;
  const scoredCount = target.evidence.filter((e) => e.score !== null).length + 1;
  const totalConfidence =
    target.evidence.reduce((sum, e) => sum + e.confidence, 0) + PROJECTED_CONFIDENCE;
  target.coverage = Math.min(1, totalConfidence / 1.6);
  target.confidence = Math.min(
    Math.max(target.confidence, PROJECTED_CONFIDENCE),
    evidenceCeiling(scoredCount),
  );
  return projected;
}

const PROJECTED_CONFIDENCE = 0.6;

export function plan(input: PlannerInput): Plan {
  const { snapshot, memory } = input;
  const timing = computeTiming(snapshot, input.elapsedSeconds);
  const notes: string[] = [];
  const projected = projectPendingAnswer(memory);

  let next: PlannedNext;
  if (memory.phase === "ENDED" || memory.phase === "CLOSING") {
    next = { kind: "END", reason: "NORMAL" };
  } else if (timing.hardStop) {
    next = { kind: "END", reason: "TIME_LIMIT" };
    notes.push("The time limit has been reached: end the interview now, politely.");
  } else {
    next = selectNext({ ...input, memory: projected }, timing.remainingSeconds, timing.phase);
  }

  const settings = snapshot.aiSettings;
  let maxFollowUps = settings.allowFollowUps ? settings.maxFollowUpsPerQuestion : 0;
  const fractionLeft = timing.remainingSeconds / timing.totalSeconds;
  if (fractionLeft < 0.25) maxFollowUps = Math.min(maxFollowUps, 1);
  if (timing.phase !== "NORMAL") maxFollowUps = 0;
  const current = memory.current;
  // Diminishing returns: if the candidate clearly struggled earlier in this thread,
  // one follow-up is enough — more would feel like an interrogation.
  if (current?.isFollowUp && current.skillKey) {
    const threadScores = (memory.skills[current.skillKey]?.evidence ?? [])
      .filter((e) => e.threadKey === current.threadKey && e.score !== null)
      .map((e) => e.score as number);
    if (threadScores.length > 0 && Math.min(...threadScores) <= 35)
      maxFollowUps = Math.min(maxFollowUps, 1);
  }
  const followUpsRemaining =
    current && current.type !== "CLOSING" && memory.phase === "QUESTIONING"
      ? Math.max(0, maxFollowUps - current.followUpDepth)
      : 0;
  const followUpAllowed =
    followUpsRemaining > 0 && timing.remainingSeconds > 90 && next.kind !== "END";

  const allowedActions: InterviewAction[] = ["CLARIFY", "END_INTERVIEW"];
  if (next.kind === "BANK" || next.kind === "GENERATE") {
    allowedActions.unshift("ASK_QUESTION");
    if (next.isNewSection && memory.phase === "QUESTIONING") allowedActions.push("MOVE_SECTION");
  }
  if (next.kind === "CLOSING") allowedActions.unshift("ACKNOWLEDGE", "ASK_QUESTION");
  if (followUpAllowed) allowedActions.push("ASK_FOLLOW_UP");

  if (timing.phase === "WRAP_UP")
    notes.push("Time is nearly up: move to the closing now; no new topics or follow-ups.");
  else if (fractionLeft < 0.25 && timing.phase === "NORMAL") {
    notes.push(
      "Time is getting short: avoid optional follow-ups and prioritise skills that haven't been covered yet.",
    );
  }
  if (memory.clarificationsForCurrent >= 2) {
    notes.push(
      "This question has already been clarified or repeated twice. If the candidate still can't answer, acknowledge kindly and move on.",
    );
  }
  if (memory.consecutiveUnclear >= 2) {
    notes.push(
      "Several recent answers were unclear. If this one is unclear too, gently mention they can type their answer instead.",
    );
  }
  if (memory.phase === "GREETING") {
    notes.push(
      "The candidate is responding to the welcome. If they're ready, begin with the next step.",
    );
  }

  const priorities = snapshot.skills.map((s) => ({
    skillKey: s.key,
    priority: skillPriority(snapshot, projected, s.key),
  }));
  return {
    timing,
    hardStop: timing.hardStop,
    followUpAllowed,
    followUpsRemaining,
    next,
    allowedActions,
    notes,
    priorities,
  };
}
