import type {
  ExperienceLevel,
  InterviewAction,
  InterviewType,
  InterviewerPersonality,
  QuestionDifficulty,
  QuestionType,
  SkillLevel,
} from "@repo/shared";

export type {
  InterviewAction,
  InterviewType,
  InterviewerPersonality,
  QuestionDifficulty,
  QuestionType,
  SkillLevel,
};
export type ExperienceLevelLike = ExperienceLevel;

export interface CategoryWeightsLike {
  technical: number;
  communication: number;
  problemSolving: number;
  experience: number;
  behavioral: number;
}
