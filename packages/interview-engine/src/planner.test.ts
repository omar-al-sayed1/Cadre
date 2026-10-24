import { describe, expect, it } from "vitest";
import { createInitialMemory, recordSkillEvidence } from "./memory";
import { computeTiming, findResumeHook, plan, skillPriority } from "./planner";
import { javaSnapshot } from "./testing/fixtures";

const evaluation = (score: number, confidence = 0.8) => ({
  answerSummary: "summary",
  score,
  confidence,
  demonstratedConcepts: [],
  missingConcepts: [],
  incorrectClaims: [],
  needsFollowUp: false,
  followUpObjective: null,
  star: null,
  candidateFacts: [],
});

describe("planner", () => {
  it("starts with the mandatory introduction question and no follow-ups", () => {
    const snapshot = javaSnapshot();
    const memory = { ...createInitialMemory(snapshot), phase: "GREETING" as const };
    const p = plan({ snapshot, memory, elapsedSeconds: 10, resume: null });
    expect(p.next.kind).toBe("BANK");
    if (p.next.kind === "BANK") {
      expect(p.next.question.key).toBe("q_intro");
      expect(p.next.isNewSection).toBe(false);
    }
    expect(p.followUpAllowed).toBe(false);
    expect(p.allowedActions).toContain("ASK_QUESTION");
    expect(p.allowedActions).not.toContain("ASK_FOLLOW_UP");
  });

  it("prioritises important, uncovered, uncertain skills", () => {
    const snapshot = javaSnapshot();
    const memory = createInitialMemory(snapshot);
    const before = skillPriority(snapshot, memory, "sk_spring");
    recordSkillEvidence(memory, "sk_spring", {
      answerId: "a",
      threadKey: "t",
      evaluation: evaluation(85),
    });
    recordSkillEvidence(memory, "sk_spring", {
      answerId: "b",
      threadKey: "t2",
      evaluation: evaluation(85),
    });
    const after = skillPriority(snapshot, memory, "sk_spring");
    expect(after).toBeLessThan(before);
    // Critical, heavily weighted Java outranks lightly weighted Git when both are uncovered.
    expect(skillPriority(snapshot, memory, "sk_java")).toBeGreaterThan(
      skillPriority(snapshot, memory, "sk_git"),
    );
  });

  it("drops a skill once it is sufficiently evaluated", () => {
    const snapshot = javaSnapshot();
    const memory = createInitialMemory(snapshot);
    for (let i = 0; i < 4; i += 1) {
      recordSkillEvidence(memory, "sk_git", {
        answerId: `a${i}`,
        threadKey: `t${i}`,
        evaluation: evaluation(80, 0.9),
      });
    }
    expect(skillPriority(snapshot, memory, "sk_git")).toBe(0);
  });

  it("allows follow-ups only within the configured depth and while time allows", () => {
    const snapshot = javaSnapshot();
    const memory = createInitialMemory(snapshot);
    memory.phase = "QUESTIONING";
    memory.current = {
      threadKey: "t1",
      questionKey: "q_java_easy",
      primaryText: "Q",
      text: "Q",
      type: "TECHNICAL",
      skillKey: "sk_java",
      sectionKey: "sec_java",
      difficulty: "EASY",
      expectedTopics: [],
      redFlags: [],
      followUpGuidance: null,
      isFollowUp: false,
      followUpDepth: 0,
      askedAtSeconds: 100,
    };
    expect(plan({ snapshot, memory, elapsedSeconds: 200, resume: null }).followUpsRemaining).toBe(
      2,
    );
    memory.current.followUpDepth = 2;
    expect(plan({ snapshot, memory, elapsedSeconds: 200, resume: null }).followUpAllowed).toBe(
      false,
    );
    memory.current.followUpDepth = 0;
    // Last quarter of the interview: at most one follow-up.
    expect(plan({ snapshot, memory, elapsedSeconds: 960, resume: null }).followUpsRemaining).toBe(
      1,
    );
    // Wrap-up phase: no follow-ups, move to closing.
    const wrap = plan({ snapshot, memory, elapsedSeconds: 1_100, resume: null });
    expect(wrap.followUpAllowed).toBe(false);
    expect(wrap.next.kind).toBe("CLOSING");
  });

  it("respects disabled follow-ups and disabled dynamic questions", () => {
    const snapshot = javaSnapshot();
    snapshot.aiSettings = {
      ...snapshot.aiSettings,
      allowFollowUps: false,
      allowDynamicQuestions: false,
    };
    const memory = createInitialMemory(snapshot);
    memory.phase = "QUESTIONING";
    memory.askedQuestionKeys = snapshot.questions
      .filter((q) => q.sectionKey === "sec_spring")
      .map((q) => q.key);
    memory.sectionIndex = 2;
    memory.sections[2]!.startedAtSeconds = 0;
    memory.sections[2]!.questionsAsked = 3;
    const p = plan({ snapshot, memory, elapsedSeconds: 400, resume: null });
    expect(p.followUpAllowed).toBe(false);
    expect(p.next.kind).toBe("BANK"); // moves to the next section rather than generating
    if (p.next.kind === "BANK") expect(p.next.section.key).toBe("sec_data");
  });

  it("ends after the closing question and hard-stops at the time limit", () => {
    const snapshot = javaSnapshot();
    const memory = createInitialMemory(snapshot);
    memory.phase = "CLOSING";
    expect(plan({ snapshot, memory, elapsedSeconds: 900, resume: null }).next).toEqual({
      kind: "END",
      reason: "NORMAL",
    });
    const strict = javaSnapshot();
    strict.aiSettings = { ...strict.aiSettings, strictTimeLimit: true };
    const m2 = { ...createInitialMemory(strict), phase: "QUESTIONING" as const };
    const p = plan({ snapshot: strict, memory: m2, elapsedSeconds: 1_201, resume: null });
    expect(p.hardStop).toBe(true);
    expect(p.next).toEqual({ kind: "END", reason: "TIME_LIMIT" });
  });

  it("computes timing phases", () => {
    const snapshot = javaSnapshot();
    expect(computeTiming(snapshot, 100).phase).toBe("NORMAL");
    expect(computeTiming(snapshot, 1_090).phase).toBe("WRAP_UP");
    expect(computeTiming(snapshot, 1_250).phase).toBe("OVERTIME");
    expect(computeTiming(snapshot, 1_250).hardStop).toBe(false);
    expect(computeTiming(snapshot, 1_200 + 181).hardStop).toBe(true);
  });

  it("finds resume hooks for a skill and never reuses one", () => {
    const resume = {
      name: null,
      email: null,
      phone: null,
      location: null,
      headline: null,
      totalYearsExperience: null,
      education: [],
      certifications: [],
      languages: [],
      skills: [],
      experience: [
        {
          company: "Acme",
          title: "Intern",
          startDate: null,
          endDate: null,
          description: "Maintained SQL reports",
          technologies: ["SQL"],
        },
      ],
      projects: [
        {
          name: "Inventory API",
          description: "Spring Boot REST service",
          technologies: ["Spring Boot"],
        },
      ],
    };
    const hook = findResumeHook(resume, "Spring Boot", []);
    expect(hook).toContain("Inventory API");
    expect(findResumeHook(resume, "Spring Boot", [hook!])).toBeNull();
    expect(findResumeHook(resume, "SQL", [])).toContain("Intern at Acme");
  });
});
