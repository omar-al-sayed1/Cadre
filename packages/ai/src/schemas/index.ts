import { z } from "zod";
import {
  INTERVIEW_ACTIONS,
  QUESTION_DIFFICULTIES,
  QUESTION_TYPES,
  RECOMMENDATIONS,
} from "@repo/shared";

/**
 * Structured-output contracts for every model call.
 *
 * Constraints for provider compatibility (structured outputs):
 *  - every property is required; optionality is expressed with `.nullable()`
 *  - no records/maps (objects must have closed property sets)
 *  - numeric/length bounds are validated client-side after parsing
 */

const shortText = z.string().max(600);
const mediumText = z.string().max(2_000);
const textList = (maxItems: number) => z.array(z.string().max(300)).max(maxItems);

// ───────────────────────── Interview generation ─────────────────────────

export const generatedQuestionSchema = z.object({
  text: z.string().min(5).max(1_000),
  type: z.enum(QUESTION_TYPES),
  difficulty: z.enum(QUESTION_DIFFICULTIES),
  skill: z.string().max(80).nullable(),
  weight: z.number().int().min(1).max(10),
  expectedTopics: textList(12),
  idealAnswer: mediumText,
  redFlags: textList(8),
  followUpGuidance: shortText,
  mandatory: z.boolean(),
});
export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;

export const generatedInterviewSchema = z.object({
  name: z.string().min(3).max(160),
  description: z.string().max(1_000),
  sections: z
    .array(
      z.object({
        name: z.string().min(2).max(120),
        description: z.string().max(600),
        targetDurationMinutes: z.number().int().min(1).max(60),
        minQuestions: z.number().int().min(0).max(20),
        maxQuestions: z.number().int().min(1).max(30),
        focusSkills: textList(10),
        questions: z.array(generatedQuestionSchema).min(1).max(15),
      }),
    )
    .min(1)
    .max(10),
});
export type GeneratedInterview = z.infer<typeof generatedInterviewSchema>;

export const generatedSingleQuestionSchema = z.object({ question: generatedQuestionSchema });

// ───────────────────────── Interview turn ─────────────────────────

export const CANDIDATE_INTENTS = [
  "ANSWER",
  "PARTIAL_ANSWER",
  "DONT_KNOW",
  "CLARIFICATION_REQUEST",
  "REPEAT_REQUEST",
  "HINT_REQUEST",
  "OFF_TOPIC",
  "PROMPT_INJECTION",
  "END_REQUEST",
  "CANDIDATE_QUESTION",
  "LANGUAGE_REQUEST",
  "UNCLEAR",
] as const;
export type CandidateIntent = (typeof CANDIDATE_INTENTS)[number];

export const starSchema = z.object({
  situation: z.boolean(),
  task: z.boolean(),
  action: z.boolean(),
  result: z.boolean(),
});
export type StarCompleteness = z.infer<typeof starSchema>;

export const answerEvaluationSchema = z.object({
  answerSummary: z.string().max(600),
  /** 0–100, relative to the expected level for the role. Null when the turn isn't an assessable answer. */
  score: z.number().int().min(0).max(100).nullable(),
  /** How much evidence this answer provides (0–1). */
  confidence: z.number().min(0).max(1),
  demonstratedConcepts: textList(12),
  missingConcepts: textList(12),
  incorrectClaims: textList(8),
  needsFollowUp: z.boolean(),
  followUpObjective: z.string().max(300).nullable(),
  star: starSchema.nullable(),
  /** New, job-relevant facts the candidate stated about themselves (no protected characteristics). */
  candidateFacts: textList(8),
});
export type AnswerEvaluation = z.infer<typeof answerEvaluationSchema>;

export const interviewTurnSchema = z.object({
  candidateIntent: z.enum(CANDIDATE_INTENTS),
  answerEvaluation: answerEvaluationSchema.nullable(),
  action: z.enum(INTERVIEW_ACTIONS),
  /** Exactly what the interviewer says aloud. Never contains hidden data. */
  spokenText: z.string().min(1).max(1_200),
  /** The primary question being asked in spokenText, if any (for records and coverage). */
  question: z
    .object({
      text: z.string().max(1_000),
      type: z.enum(QUESTION_TYPES),
      skill: z.string().max(80).nullable(),
      difficulty: z.enum(QUESTION_DIFFICULTIES),
    })
    .nullable(),
  /** Short server-only rationale. Never shown to the candidate. */
  reasonInternal: z.string().max(400),
});
export type InterviewTurnOutput = z.infer<typeof interviewTurnSchema>;

// ───────────────────────── Final evaluation ─────────────────────────

const evidenceRefSchema = z.object({
  answerId: z.string().max(64),
  assessment: z.string().max(400),
});

const competencySchema = z.object({
  score: z.number().int().min(0).max(100).nullable(),
  confidence: z.number().min(0).max(1),
  summary: z.string().max(800),
  evidence: z.array(evidenceRefSchema).max(8),
});
export type CompetencyAssessment = z.infer<typeof competencySchema>;

export const RESUME_ALIGNMENTS = [
  "CONSISTENT",
  "PARTIALLY_SUPPORTED",
  "NOT_DEMONSTRATED",
  "NOT_ASSESSED",
] as const;

export const finalEvaluationSchema = z.object({
  summary: z.string().min(1).max(2_500),
  skills: z
    .array(
      z.object({
        skillKey: z.string().max(64),
        score: z.number().int().min(0).max(100).nullable(),
        confidence: z.number().min(0).max(1),
        insufficientEvidence: z.boolean(),
        summary: z.string().max(800),
        evidence: z.array(evidenceRefSchema).max(10),
      }),
    )
    .max(30),
  communication: competencySchema,
  problemSolving: competencySchema,
  experience: competencySchema,
  behavioral: competencySchema,
  questions: z
    .array(
      z.object({
        threadKey: z.string().max(64),
        score: z.number().int().min(0).max(100).nullable(),
        answerSummary: z.string().max(800),
        assessment: z.string().max(800),
        insufficientEvidence: z.boolean(),
      }),
    )
    .max(60),
  strengths: z
    .array(
      z.object({
        title: z.string().max(160),
        evidence: z.string().max(600),
        answerIds: z.array(z.string().max(64)).max(6),
      }),
    )
    .max(8),
  concerns: z
    .array(
      z.object({
        title: z.string().max(160),
        evidence: z.string().max(600),
        answerIds: z.array(z.string().max(64)).max(6),
      }),
    )
    .max(8),
  followUpTopics: z.array(z.string().max(300)).max(8),
  resumeAlignment: z.object({
    summary: z.string().max(1_000),
    items: z
      .array(
        z.object({
          claim: z.string().max(300),
          interviewEvidence: z.string().max(500),
          alignment: z.enum(RESUME_ALIGNMENTS),
        }),
      )
      .max(10),
  }),
  recommendation: z.enum(RECOMMENDATIONS),
  recommendationConfidence: z.number().min(0).max(1),
});
export type FinalEvaluationOutput = z.infer<typeof finalEvaluationSchema>;

// ───────────────────────── Resume parsing ─────────────────────────

export const parsedResumeSchema = z.object({
  name: z.string().max(160).nullable(),
  email: z.string().max(254).nullable(),
  phone: z.string().max(60).nullable(),
  location: z.string().max(160).nullable(),
  headline: z.string().max(300).nullable(),
  totalYearsExperience: z.number().min(0).max(60).nullable(),
  education: z
    .array(
      z.object({
        institution: z.string().max(200),
        degree: z.string().max(200).nullable(),
        field: z.string().max(200).nullable(),
        startDate: z.string().max(40).nullable(),
        endDate: z.string().max(40).nullable(),
      }),
    )
    .max(10),
  experience: z
    .array(
      z.object({
        company: z.string().max(200),
        title: z.string().max(200),
        startDate: z.string().max(40).nullable(),
        endDate: z.string().max(40).nullable(),
        description: z.string().max(1_500),
        technologies: z.array(z.string().max(60)).max(30),
      }),
    )
    .max(20),
  skills: z.array(z.string().max(80)).max(80),
  projects: z
    .array(
      z.object({
        name: z.string().max(200),
        description: z.string().max(1_000),
        technologies: z.array(z.string().max(60)).max(30),
      }),
    )
    .max(15),
  certifications: z.array(z.string().max(200)).max(20),
  languages: z.array(z.string().max(80)).max(15),
});
export type ParsedResume = z.infer<typeof parsedResumeSchema>;

// ───────────────────────── Standalone answer evaluation ─────────────────────────

export const standaloneAnswerEvaluationSchema = z.object({
  evaluation: answerEvaluationSchema,
  codeQuality: z
    .object({
      correctnessNotes: z.string().max(600),
      qualityNotes: z.string().max(600),
      complexity: z.string().max(200),
      edgeCases: z.string().max(600),
    })
    .nullable(),
});
export type StandaloneAnswerEvaluation = z.infer<typeof standaloneAnswerEvaluationSchema>;
