import type { InterviewAction, QuestionDifficulty } from "@repo/shared";
import { PROMPT_VERSIONS } from "../prompts";
import type {
  FinalEvaluationOutput,
  GeneratedInterview,
  GeneratedQuestion,
  InterviewTurnOutput,
  ParsedResume,
  StandaloneAnswerEvaluation,
} from "../schemas";
import type {
  AiResult,
  EvaluateAnswerInput,
  EvaluationThread,
  FinalEvaluationInput,
  GenerateInterviewInput,
  GenerateQuestionInput,
  InterviewAI,
  JobContext,
  ParseResumeInput,
  TurnInput,
} from "../service/types";
import { classifyIntent, heuristicEvaluation, isNearDuplicate, summarize } from "./heuristics";
import {
  BEHAVIORAL_SEEDS,
  CLOSING_SEED,
  genericSeeds,
  INTRO_SEED,
  libraryFor,
  type DemoQuestionSeed,
} from "./knowledge";
import { parseResumeHeuristically } from "./resume";

/**
 * DEMO_MODE implementation of InterviewAI. Fully deterministic, no network.
 * It follows the same planner directive contract as the production model, so the
 * whole interview pipeline (follow-ups, adaptive difficulty, sections, wrap-up,
 * evaluation) is exercised end-to-end.
 */
export class DemoInterviewAI implements InterviewAI {
  readonly providerName = "demo";
  readonly modelName = "demo-heuristic-v1";

  private result<T>(data: T, promptVersion: string): Promise<AiResult<T>> {
    return Promise.resolve({
      data,
      promptVersion,
      provider: this.providerName,
      model: this.modelName,
    });
  }

  // ───────────────────────── Generation ─────────────────────────

  generateInterview(input: GenerateInterviewInput): Promise<AiResult<GeneratedInterview>> {
    const total = input.durationMinutes;
    const skills = [...input.job.skills].sort((a, b) => b.weight - a.weight);
    const includeBehavioral = ["MIXED", "BEHAVIORAL", "SCREENING", "HR"].includes(
      input.interviewType,
    );
    const technicalSkills =
      input.interviewType === "BEHAVIORAL" || input.interviewType === "HR"
        ? skills.slice(0, 1)
        : skills;

    const introMinutes = Math.max(2, Math.round(total * 0.1));
    const closingMinutes = Math.max(1, Math.round(total * 0.06));
    const behavioralMinutes = includeBehavioral ? Math.max(3, Math.round(total * 0.18)) : 0;
    const skillBudget = Math.max(
      technicalSkills.length,
      total - introMinutes - closingMinutes - behavioralMinutes,
    );

    // Group skills into at most 4 sections, sized by weight.
    const groups: (typeof skills)[] = [];
    technicalSkills.forEach((skill, i) => {
      const idx = groups.length < 4 ? groups.length : i % 4;
      (groups[idx] ??= []).push(skill);
    });
    const totalWeight = technicalSkills.reduce((sum, s) => sum + s.weight, 0) || 1;

    const sections: GeneratedInterview["sections"] = [
      {
        name: "Introduction & Background",
        description: "Warm-up and an overview of the candidate's relevant experience.",
        targetDurationMinutes: introMinutes,
        minQuestions: 1,
        maxQuestions: 2,
        focusSkills: [],
        questions: [toGenerated({ ...INTRO_SEED }, null, true)],
      },
    ];

    let allocated = 0;
    groups.forEach((group, index) => {
      const weight = group.reduce((sum, s) => sum + s.weight, 0);
      const minutes =
        index === groups.length - 1
          ? Math.max(2, skillBudget - allocated)
          : Math.max(2, Math.round((skillBudget * weight) / totalWeight));
      allocated += minutes;
      const questions = group.flatMap((skill) =>
        (libraryFor(skill.name) ?? genericSeeds(skill.name)).map((seed, qi) =>
          toGenerated(seed, skill.name, qi === 0 && skill.critical),
        ),
      );
      sections.push({
        name: group.map((s) => s.name).join(" & "),
        description: `Assess ${group.map((s) => s.name).join(", ")} at the level expected for the role.`,
        targetDurationMinutes: minutes,
        minQuestions: Math.min(questions.length, Math.max(1, Math.floor(minutes / 4))),
        maxQuestions: Math.min(questions.length, Math.max(2, Math.ceil(minutes / 2.5))),
        focusSkills: group.map((s) => s.name),
        questions,
      });
    });

    if (includeBehavioral) {
      sections.push({
        name: "Situational & Behavioral",
        description: "STAR-style questions about teamwork and problem solving.",
        targetDurationMinutes: behavioralMinutes,
        minQuestions: 1,
        maxQuestions: 2,
        focusSkills: [],
        questions: BEHAVIORAL_SEEDS.map((seed) => toGenerated(seed, null, false)),
      });
    }

    sections.push({
      name: "Candidate Questions & Closing",
      description: "Give the candidate the chance to add anything and close professionally.",
      targetDurationMinutes: closingMinutes,
      minQuestions: 0,
      maxQuestions: 1,
      focusSkills: [],
      questions: [toGenerated(CLOSING_SEED, null, false)],
    });

    return this.result(
      {
        name: `${input.job.title} — AI ${titleCase(input.interviewType)} Interview`,
        description: `A ${total}-minute ${input.interviewType.toLowerCase()} interview covering ${skills.map((s) => s.name).join(", ") || "role fundamentals"}.`,
        sections,
      },
      PROMPT_VERSIONS.questionGenerator,
    );
  }

  generateQuestion(input: GenerateQuestionInput): Promise<AiResult<GeneratedQuestion>> {
    const avoid = new Set(input.avoid.map((q) => q.trim().toLowerCase()));
    const pool =
      input.type === "BEHAVIORAL"
        ? BEHAVIORAL_SEEDS
        : input.skillName
          ? (libraryFor(input.skillName) ?? genericSeeds(input.skillName))
          : [INTRO_SEED];
    const candidates = pool.filter((seed) => !avoid.has(seed.text.toLowerCase()));
    const seed =
      candidates.find((s) => s.difficulty === input.difficulty) ??
      candidates[0] ??
      genericSeeds(input.skillName ?? "this area").find((s) => !avoid.has(s.text.toLowerCase())) ??
      genericSeeds(input.skillName ?? "this area")[0]!;
    return this.result(
      toGenerated(seed, input.skillName, false),
      PROMPT_VERSIONS.questionGenerator,
    );
  }

  // ───────────────────────── Interview turn ─────────────────────────

  getNextInterviewAction(input: TurnInput): Promise<AiResult<InterviewTurnOutput>> {
    const { directive, currentQuestion } = input;
    const closing = directive.next.kind === "CLOSING" || directive.next.kind === "END";
    const intent = classifyIntent(
      input.candidateMessage,
      currentQuestion,
      closing && currentQuestion?.type === "CLOSING",
    );
    const allowed = new Set<InterviewAction>(directive.allowedActions);
    const skillNames = input.job.skills.map((s) => s.name);
    const ack = pickAcknowledgement(input);

    const evaluation =
      currentQuestion && (intent === "ANSWER" || intent === "DONT_KNOW")
        ? heuristicEvaluation(input.candidateMessage, currentQuestion, intent, skillNames)
        : null;

    const reply = (
      action: InterviewAction,
      spokenText: string,
      reason: string,
      question: InterviewTurnOutput["question"] = null,
    ) =>
      this.result<InterviewTurnOutput>(
        {
          candidateIntent: intent,
          answerEvaluation: evaluation,
          action,
          spokenText,
          question,
          reasonInternal: reason,
        },
        PROMPT_VERSIONS.interviewer,
      );

    const currentText = currentQuestion?.text ?? "";
    switch (intent) {
      case "UNCLEAR":
        return reply(
          "CLARIFY",
          "Sorry, I didn't fully catch that. Could you repeat or rephrase your answer?",
          "Transcript unclear.",
        );
      case "PROMPT_INJECTION":
        return reply(
          "CLARIFY",
          `I can't share internal interview configuration, but I'm happy to clarify the question. ${currentText}`.trim(),
          "Declined a request for internal configuration.",
        );
      case "REPEAT_REQUEST":
        return reply(
          "CLARIFY",
          currentText ? `Of course. ${currentText}` : "Of course. Are you ready to begin?",
          "Repeated the question.",
        );
      case "CLARIFICATION_REQUEST":
        return reply(
          "CLARIFY",
          currentQuestion
            ? `Sure. I'm interested in your own understanding of ${currentQuestion.skillName ?? "this topic"}, explained in your own words, ideally with an example from your experience. ${currentText}`
            : "Sure. I'll ask you a series of questions about your experience and the role. Are you ready to begin?",
          "Clarified the question without revealing the answer.",
        );
      case "HINT_REQUEST":
        return reply(
          "CLARIFY",
          `I can clarify the question, but I can't provide the answer during the interview. ${currentText}`.trim(),
          "Declined to provide an answer.",
        );
      case "LANGUAGE_REQUEST":
        return reply(
          "CLARIFY",
          `I'm sorry, this interview is configured to continue in the current language. ${currentText}`.trim(),
          "Language switching not enabled in demo mode.",
        );
      case "END_REQUEST":
        if (allowed.has("END_INTERVIEW")) {
          return reply(
            "END_INTERVIEW",
            closingStatement(input),
            "Candidate asked to end the interview.",
          );
        }
        break;
      default:
        break;
    }

    // Follow-up when the answer leaves a gap and the planner allows it.
    if (
      evaluation?.needsFollowUp &&
      intent === "ANSWER" &&
      directive.followUpAllowed &&
      allowed.has("ASK_FOLLOW_UP") &&
      currentQuestion
    ) {
      const followUp = buildFollowUp(
        input,
        evaluation.star,
        evaluation.missingConcepts[0] ?? null,
        evaluation.candidateFacts,
      );
      return reply(
        "ASK_FOLLOW_UP",
        `${ack} ${followUp}`,
        evaluation.followUpObjective ?? "Answer incomplete.",
        {
          text: followUp,
          type: currentQuestion.type === "BEHAVIORAL" ? "BEHAVIORAL" : "FOLLOW_UP",
          skill: currentQuestion.skillName,
          difficulty: currentQuestion.difficulty,
        },
      );
    }

    const next = directive.next;
    const nextSkill =
      next.kind === "BANK_QUESTION" || next.kind === "GENERATE_QUESTION" ? next.skillName : null;
    const nextIsNewSection =
      (next.kind === "BANK_QUESTION" || next.kind === "GENERATE_QUESTION") && next.isNewSection;
    const lead =
      intent === "DONT_KNOW"
        ? nextIsNewSection || next.kind === "CLOSING" || next.kind === "END"
          ? "That's okay."
          : nextSkill && nextSkill === currentQuestion?.skillName
            ? "That's okay — let's try a different question."
            : "That's okay. Let's move to another area."
        : !currentQuestion
          ? "Great, let's begin."
          : ack;

    switch (next.kind) {
      case "BANK_QUESTION": {
        const transition =
          next.isNewSection && currentQuestion
            ? ` Let's move on to ${next.sectionName.toLowerCase()}.`
            : "";
        return reply(
          "ASK_QUESTION",
          `${lead}${transition} ${next.text}`.trim(),
          "Asked the planned question.",
          { text: next.text, type: next.type, skill: next.skillName, difficulty: next.difficulty },
        );
      }
      case "GENERATE_QUESTION": {
        const seed = pickSeed(
          next.skillName,
          next.type,
          next.difficulty,
          input.memory.askedQuestions,
        );
        const text = next.resumeHook
          ? `I noticed on your resume: ${next.resumeHook}. What was your role there, and how did you use ${next.skillName ?? "the relevant technologies"}?`
          : seed.text;
        const transition =
          next.isNewSection && currentQuestion
            ? ` Let's move on to ${next.sectionName.toLowerCase()}.`
            : "";
        return reply(
          "ASK_QUESTION",
          `${lead}${transition} ${text}`.trim(),
          "Generated a question for an under-covered skill.",
          {
            text,
            type: next.resumeHook ? "EXPERIENCE" : seed.type,
            skill: next.skillName,
            difficulty: next.difficulty,
          },
        );
      }
      case "CLOSING":
        if (next.askAnythingToAdd) {
          return reply(
            "ACKNOWLEDGE",
            `${lead} We're nearly at the end. ${CLOSING_SEED.text}`,
            "Closing question.",
            {
              text: CLOSING_SEED.text,
              type: "CLOSING",
              skill: null,
              difficulty: "EASY",
            },
          );
        }
        return reply("END_INTERVIEW", closingStatement(input), "Interview complete.");
      case "END": {
        const prefix =
          intent === "CANDIDATE_QUESTION"
            ? "Thank you for the question — the hiring team will be happy to follow up on that. "
            : "";
        return reply("END_INTERVIEW", `${prefix}${closingStatement(input)}`, "Interview complete.");
      }
    }
  }

  // ───────────────────────── Evaluation ─────────────────────────

  evaluateAnswer(input: EvaluateAnswerInput): Promise<AiResult<StandaloneAnswerEvaluation>> {
    const evaluation = heuristicEvaluation(
      input.answer,
      input.question,
      "ANSWER",
      input.job.skills.map((s) => s.name),
    );
    let codeQuality: StandaloneAnswerEvaluation["codeQuality"] = null;
    if (input.code) {
      const results = input.code.testResults ?? [];
      const passed = results.filter((r) => r.passed).length;
      const ratio = results.length > 0 ? passed / results.length : null;
      if (ratio !== null) evaluation.score = Math.round(40 + 55 * ratio);
      codeQuality = {
        correctnessNotes:
          results.length > 0
            ? `${passed} of ${results.length} tests passed.`
            : "No tests were run.",
        qualityNotes:
          input.code.source.split("\n").length > 3
            ? "Code is structured across multiple lines."
            : "Very short solution.",
        complexity: "Not analysed in demo mode.",
        edgeCases: "Not analysed in demo mode.",
      };
    }
    return this.result({ evaluation, codeQuality }, PROMPT_VERSIONS.answerEvaluation);
  }

  evaluateInterview(input: FinalEvaluationInput): Promise<AiResult<FinalEvaluationOutput>> {
    return this.result(buildDemoEvaluation(input), PROMPT_VERSIONS.evaluation);
  }

  parseResume(input: ParseResumeInput): Promise<AiResult<ParsedResume>> {
    return this.result(parseResumeHeuristically(input.text), PROMPT_VERSIONS.resumeParser);
  }
}

// ───────────────────────── helpers ─────────────────────────

function toGenerated(
  seed: DemoQuestionSeed,
  skill: string | null,
  mandatory: boolean,
): GeneratedQuestion {
  return {
    text: seed.text,
    type: seed.type,
    difficulty: seed.difficulty,
    skill,
    weight: seed.difficulty === "HARD" ? 3 : seed.difficulty === "MEDIUM" ? 2 : 1,
    expectedTopics: seed.expectedTopics,
    idealAnswer: seed.idealAnswer,
    redFlags: seed.redFlags,
    followUpGuidance: seed.followUpGuidance,
    mandatory: mandatory || seed.type === "INTRODUCTION",
  };
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

const ACKS = [
  "Thank you.",
  "Understood.",
  "That's helpful.",
  "Thanks for explaining that.",
  "Got it, thank you.",
];

function pickAcknowledgement(input: TurnInput): string {
  const lastAi = [...input.recentTranscript].reverse().find((t) => t.role === "AI")?.text ?? "";
  const index = input.memory.askedQuestions.length % ACKS.length;
  const candidate = ACKS[index]!;
  return lastAi.startsWith(candidate) ? ACKS[(index + 1) % ACKS.length]! : candidate;
}

function pickSeed(
  skillName: string | null,
  type: string,
  difficulty: QuestionDifficulty,
  asked: string[],
): DemoQuestionSeed {
  const pool =
    type === "BEHAVIORAL" || type === "SITUATIONAL"
      ? BEHAVIORAL_SEEDS
      : [
          ...(skillName ? (libraryFor(skillName) ?? []) : []),
          ...genericSeeds(skillName ?? "your most relevant skills"),
        ];
  const fresh = pool.filter((s) => !isNearDuplicate(s.text, asked));
  return fresh.find((s) => s.difficulty === difficulty) ?? fresh[0] ?? pool[pool.length - 1]!;
}

function guidanceToQuestion(guidance: string): string | null {
  const g = guidance.trim().replace(/\.$/, "");
  const swap = (s: string) =>
    s
      .replace(/\bthey mention(ed)?\b/gi, "you mentioned")
      .replace(/\bthey'd\b/gi, "you'd")
      .replace(/\bthey\b/gi, "you")
      .replace(/\btheir\b/gi, "your")
      .replace(/\bthem\b/gi, "you");
  let m = /^(?:ask|probe)\s+about\s+(.+)$/i.exec(g);
  if (m?.[1]) return `Could you tell me more about ${swap(m[1])}?`;
  m = /^(?:ask|probe)\s+how\s+(?:they'd|they would)\s+(.+)$/i.exec(g);
  if (m?.[1]) return `How would you ${swap(m[1])}?`;
  m = /^(?:ask|probe)\s+(what|why|how|which|when)\s+(.+)$/i.exec(g);
  // Embedded-question form stays grammatical: "Could you explain how you resolve merge conflicts?"
  if (m?.[1] && m[2]) return `Could you explain ${m[1].toLowerCase()} ${swap(m[2])}?`;
  m = /^ask\s+(?:them\s+)?(?:for|to)\s+(.+)$/i.exec(g);
  if (m?.[1])
    return `Could you ${/^(a|an|the)\b/i.test(m[1]) ? `give me ${swap(m[1])}` : swap(m[1])}?`;
  return null;
}

function buildFollowUp(
  input: TurnInput,
  star: { situation: boolean; task: boolean; action: boolean; result: boolean } | null,
  missingTopic: string | null,
  facts: string[],
): string {
  const q = input.currentQuestion!;
  const options: string[] = [];
  if (star) {
    if (!star.situation)
      options.push(
        "Could you set the scene a bit more — what was the situation and who was involved?",
      );
    if (!star.action)
      options.push("What specifically was your role, and what actions did you personally take?");
    if (!star.result) options.push("What was the outcome, and what did you learn from it?");
    if (!star.task) options.push("What exactly were you responsible for in that situation?");
  }
  const built = facts.find((f) =>
    /^(built|created|developed|designed|implemented|worked on|led)/i.test(f),
  );
  if (q.type === "INTRODUCTION" && built) {
    options.push(
      `You mentioned that you ${built}. Let's talk about that project — how did you structure it, and what was your role?`,
    );
  }
  if (q.followUpGuidance) {
    const converted = guidanceToQuestion(q.followUpGuidance);
    if (converted) options.push(`Let's go a little deeper. ${converted}`);
  }
  if (missingTopic && q.type !== "INTRODUCTION") {
    options.push(
      `I'd like to hear a bit more about ${missingTopic.charAt(0).toLowerCase()}${missingTopic.slice(1)}. How does it apply to what you just described?`,
    );
  }
  options.push(
    "Could you give me a concrete example from your own experience?",
    "What was the most challenging part of that, and how did you handle it?",
    "Looking back, what would you do differently today?",
  );
  const asked = input.memory.askedQuestions;
  return (
    options.find((option) => !isNearDuplicate(option, asked, 0.6)) ?? options[options.length - 1]!
  );
}

function closingStatement(input: TurnInput): string {
  return `Thank you for your time today, ${input.candidateFirstName}. That concludes the interview for the ${input.job.title} position. Your responses have been recorded and will be reviewed by the hiring team. We appreciate your interest in the role.`;
}

// ───────────────────────── demo final evaluation ─────────────────────────

function average(values: number[]): number | null {
  return values.length === 0 ? null : Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function bestTurn(threads: EvaluationThread[]) {
  return threads
    .flatMap((t) => t.turns)
    .filter((t) => t.interimScore !== null)
    .sort((a, b) => (b.interimScore ?? 0) - (a.interimScore ?? 0));
}

function buildDemoEvaluation(input: FinalEvaluationInput): FinalEvaluationOutput {
  const { threads, job } = input;
  const allTurns = threads.flatMap((t) => t.turns);
  const answered = allTurns.filter((t) => t.answer.trim().length > 0);

  const skills = job.skills.map((skill) => {
    const related = threads.filter((t) => t.skillKey === skill.key);
    const turns = related.flatMap((t) => t.turns).filter((t) => t.interimScore !== null);
    const score = average(turns.map((t) => t.interimScore!));
    const insufficient = turns.length === 0;
    return {
      skillKey: skill.key,
      score: insufficient ? null : score,
      confidence: insufficient ? 0.1 : Math.min(0.9, 0.25 + 0.18 * turns.length),
      insufficientEvidence: insufficient,
      summary: insufficient
        ? `${skill.name} was not assessed in enough depth during the interview.`
        : `${skill.name}: ${describeScore(score ?? 0)} based on ${turns.length} answer${turns.length === 1 ? "" : "s"}.`,
      evidence: turns.slice(0, 4).map((t) => ({
        answerId: t.answerId,
        assessment: t.interimSummary
          ? `Answer: ${summarize(t.interimSummary, 25)}`
          : "Answer assessed during the interview.",
      })),
    };
  });

  const byType = (types: string[]) =>
    threads
      .filter((t) => types.includes(t.type))
      .flatMap((t) => t.turns)
      .filter((t) => t.interimScore !== null);
  const competency = (turns: typeof allTurns, label: string) => {
    const score = average(turns.map((t) => t.interimScore!));
    return {
      score,
      confidence: turns.length === 0 ? 0.1 : Math.min(0.85, 0.25 + 0.15 * turns.length),
      summary: score === null ? `${label} was not assessed.` : `${label}: ${describeScore(score)}.`,
      evidence: turns
        .slice(0, 3)
        .map((t) => ({ answerId: t.answerId, assessment: `Interim score ${t.interimScore}.` })),
    };
  };

  const avgWords =
    answered.length > 0
      ? answered.reduce((sum, t) => sum + t.answer.split(/\s+/).length, 0) / answered.length
      : 0;
  const communicationScore =
    answered.length === 0 ? null : Math.round(Math.max(30, Math.min(88, 40 + avgWords * 0.6)));
  const communication = {
    score: communicationScore,
    confidence: answered.length >= 4 ? 0.7 : answered.length > 0 ? 0.4 : 0.1,
    summary:
      communicationScore === null
        ? "Communication could not be assessed."
        : avgWords < 20
          ? "Answers were generally brief; more detail and structure would strengthen them."
          : "Answers were generally clear and reasonably structured.",
    evidence: answered
      .slice(0, 2)
      .map((t) => ({ answerId: t.answerId, assessment: "Representative answer." })),
  };

  const ranked = bestTurn(threads);
  const scoredSkills = skills
    .filter((s) => s.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const strengths = scoredSkills
    .filter((s) => (s.score ?? 0) >= 65)
    .slice(0, 3)
    .map((s) => {
      const name = job.skills.find((js) => js.key === s.skillKey)?.name ?? s.skillKey;
      return {
        title: `${describeScore(s.score ?? 0, true)} ${name} knowledge`,
        evidence: s.summary,
        answerIds: s.evidence.map((e) => e.answerId).slice(0, 3),
      };
    });
  const concerns = skills
    .filter((s) => s.insufficientEvidence || (s.score ?? 100) < 50)
    .slice(0, 3)
    .map((s) => {
      const name = job.skills.find((js) => js.key === s.skillKey)?.name ?? s.skillKey;
      return s.insufficientEvidence
        ? {
            title: `Limited evidence for ${name}`,
            evidence: `${name} was not covered in enough depth to assess.`,
            answerIds: [],
          }
        : {
            title: `Limited ${name} depth`,
            evidence: s.summary,
            answerIds: s.evidence.map((e) => e.answerId).slice(0, 3),
          };
    });

  const overall = average(scoredSkills.map((s) => s.score!));
  const coverage = job.skills.length > 0 ? scoredSkills.length / job.skills.length : 1;
  const recommendation: FinalEvaluationOutput["recommendation"] =
    answered.length < 3 || overall === null || coverage < 0.4
      ? "INSUFFICIENT_EVIDENCE"
      : overall >= 82
        ? "STRONG_MOVE_FORWARD"
        : overall >= 68
          ? "MOVE_FORWARD"
          : overall >= 52
            ? "BORDERLINE"
            : "DO_NOT_MOVE_FORWARD";

  const resumeItems =
    input.resume?.skills
      .map((claim) => {
        const skill = job.skills.find((s) => s.name.toLowerCase() === claim.toLowerCase());
        if (!skill) return null;
        const s = skills.find((x) => x.skillKey === skill.key);
        const alignment:
          "CONSISTENT" | "PARTIALLY_SUPPORTED" | "NOT_DEMONSTRATED" | "NOT_ASSESSED" =
          !s || s.score === null
            ? "NOT_ASSESSED"
            : s.score >= 70
              ? "CONSISTENT"
              : s.score >= 45
                ? "PARTIALLY_SUPPORTED"
                : "NOT_DEMONSTRATED";
        return {
          claim: `Resume lists ${claim}`,
          interviewEvidence: s?.score == null ? "Not covered in the interview." : s.summary,
          alignment,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .slice(0, 8) ?? [];

  const top = scoredSkills[0];
  const topName = top ? job.skills.find((s) => s.key === top.skillKey)?.name : undefined;
  const summary = [
    `The candidate completed ${answered.length} answers across ${threads.length} topics for the ${job.title} role.`,
    overall !== null
      ? `Overall performance was ${describeScore(overall)} relative to the ${job.experienceLevel.toLowerCase()} expectations for the role.`
      : "There was not enough evidence for an overall assessment.",
    topName ? `The strongest area was ${topName}.` : "",
    concerns.length > 0
      ? `Areas to validate further: ${concerns.map((c) => c.title.replace(/^Limited (evidence for |)/, "")).join(", ")}.`
      : "",
    "This demo-mode evaluation is generated by deterministic heuristics, not an AI model.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    summary,
    skills,
    communication,
    problemSolving: competency(
      byType(["PROBLEM_SOLVING", "SYSTEM_DESIGN", "CODING", "TECHNICAL"]),
      "Problem solving",
    ),
    experience: competency(byType(["INTRODUCTION", "EXPERIENCE"]), "Relevant experience"),
    behavioral: competency(byType(["BEHAVIORAL", "SITUATIONAL"]), "Behavioral competencies"),
    questions: threads.map((thread) => {
      const scored = thread.turns.filter((t) => t.interimScore !== null);
      const score = average(scored.map((t) => t.interimScore!));
      return {
        threadKey: thread.threadKey,
        score,
        answerSummary:
          thread.turns.map((t) => t.interimSummary ?? summarize(t.answer, 30)).join(" / ") ||
          "No answer.",
        assessment:
          score === null
            ? "Not enough evidence to assess this question."
            : `${describeScore(score, true)} answer.`,
        insufficientEvidence: score === null,
      };
    }),
    strengths:
      strengths.length > 0 || ranked.length === 0
        ? strengths
        : [
            {
              title: "Engaged with the interview",
              evidence: "Answered the questions asked.",
              answerIds: [ranked[0]!.answerId],
            },
          ],
    concerns,
    followUpTopics: concerns
      .map(
        (c) =>
          `Probe ${c.title.replace(/^Limited (evidence for |)/, "").toLowerCase()} with a practical exercise.`,
      )
      .slice(0, 4),
    resumeAlignment: {
      summary: input.resume
        ? "Resume claims compared with interview evidence for the role's skills."
        : "No resume was provided.",
      items: resumeItems,
    },
    recommendation,
    recommendationConfidence:
      recommendation === "INSUFFICIENT_EVIDENCE" ? 0.3 : Math.min(0.85, 0.35 + coverage * 0.4),
  };
}

function describeScore(score: number, capitalized = false): string {
  const label =
    score >= 91
      ? "exceptional"
      : score >= 76
        ? "strong"
        : score >= 61
          ? "competent"
          : score >= 41
            ? "basic"
            : score >= 21
              ? "limited"
              : "minimal";
  return capitalized ? label.charAt(0).toUpperCase() + label.slice(1) : label;
}

export type { JobContext };
