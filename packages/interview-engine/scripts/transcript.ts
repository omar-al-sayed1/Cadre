import { DemoInterviewAI } from "@repo/ai";
import { InterviewEngine } from "../src/engine";
import { javaSnapshot, STRONG_ANSWERS } from "../src/testing/fixtures";
import { simulateInterview } from "../src/testing/simulate";

const mode = process.argv[2] ?? "strong";
const weak = [
  "I've used Java for around two years, mainly in university and personal projects.",
  "I created a backend for an inventory management system using Spring Boot.",
  "I used controllers, services and repositories.",
  "I think it is something with classes maybe.",
  "I don't know.",
];
const { greeting, turns } = await simulateInterview(
  new InterviewEngine(new DemoInterviewAI()),
  javaSnapshot(),
  {
    answer: (current, i) =>
      mode === "strong"
        ? current?.questionKey
          ? (STRONG_ANSWERS[current.questionKey] ?? STRONG_ANSWERS.q_di!)
          : current
            ? STRONG_ANSWERS.q_di!
            : "Yes, I'm ready."
        : i === 0
          ? "Yes."
          : weak[Math.min(i - 1, weak.length - 1)]!,
    secondsPerTurn: 70,
  },
);
console.log(`AI: ${greeting.reply.text}\n`);
for (const t of turns) {
  console.log(`CANDIDATE: ${t.candidate.slice(0, 110)}${t.candidate.length > 110 ? "…" : ""}`);
  const ev = t.result.evaluation;
  console.log(
    `   [intent=${t.result.intent} score=${ev?.score ?? "-"} action=${t.result.reply.action} section=${t.result.reply.sectionKey ?? "-"} diff=${t.result.reply.difficulty ?? "-"}]`,
  );
  console.log(`AI: ${t.result.reply.text}\n`);
}
