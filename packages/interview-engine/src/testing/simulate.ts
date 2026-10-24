import type { ParsedResume } from "@repo/ai";
import type { CandidateTurn, EngineTurnResult, InterviewEngine } from "../engine";
import { createInitialMemory, type CurrentQuestion, type EngineMemory } from "../memory";
import type { TemplateSnapshot } from "../snapshot";

export interface SimulatedTurn {
  candidate: string;
  result: EngineTurnResult;
}

export interface SimulationOptions {
  /** Produce the candidate's message for the current question. */
  answer: (current: CurrentQuestion | null, turnIndex: number, memory: EngineMemory) => string;
  secondsPerTurn?: number;
  maxTurns?: number;
  resume?: ParsedResume | null;
  firstName?: string;
}

/** Drive an interview from greeting to completion (or maxTurns) for tests and fixtures. */
export async function simulateInterview(
  engine: InterviewEngine,
  snapshot: TemplateSnapshot,
  options: SimulationOptions,
) {
  const secondsPerTurn = options.secondsPerTurn ?? 60;
  const maxTurns = options.maxTurns ?? 40;
  const candidate = { firstName: options.firstName ?? "Omar", resume: options.resume ?? null };
  let elapsed = 0;
  const greeting = engine.begin({
    snapshot,
    memory: createInitialMemory(snapshot),
    candidate,
    elapsedSeconds: 0,
  });
  let memory = greeting.memory;
  const turns: SimulatedTurn[] = [];
  for (let i = 0; i < maxTurns && memory.phase !== "ENDED"; i += 1) {
    elapsed += secondsPerTurn;
    const text = options.answer(memory.current, i, memory);
    const turn: CandidateTurn = { answerId: `ans_${i}`, text, source: "TEXT" };
    const result = await engine.respond(
      { snapshot, memory, candidate, elapsedSeconds: elapsed },
      turn,
    );
    turns.push({ candidate: text, result });
    memory = result.memory;
  }
  return { greeting, turns, memory, elapsed };
}
