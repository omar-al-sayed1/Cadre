import type { Metadata } from "next";
import { Library } from "lucide-react";
import { can, listBankQuestions, listSkills } from "@repo/core";
import { EmptyState, PageHeader } from "@/components/common";
import { requireActor } from "@/server/auth-context";
import { BankEditor } from "./bank-editor";

export const metadata: Metadata = { title: "Question bank" };

export default async function QuestionBankPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const actor = await requireActor();
  const params = await searchParams;
  const [items, skills] = await Promise.all([
    listBankQuestions(actor, { q: params.q, tag: params.tag }),
    listSkills(actor),
  ]);
  const canWrite = can(actor, "questionBank.write");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Question bank"
        description="Reusable questions your team can add to any interview."
      />
      <BankEditor
        canWrite={canWrite}
        skills={skills.map((s) => ({ id: s.id, name: s.name }))}
        items={items.map((i) => ({
          id: i.id,
          text: i.text,
          type: i.type,
          difficulty: i.difficulty,
          skillId: i.skillId,
          skillName: i.skill?.name ?? null,
          tags: i.tags,
          expectedTopics: i.expectedTopics,
          idealAnswer: i.idealAnswer,
          weight: i.weight,
        }))}
        initialQuery={params.q ?? ""}
      />
      {items.length === 0 && !params.q ? (
        <EmptyState
          icon={Library}
          title="Your question bank is empty"
          description="Save questions you use often, or import them from CSV (question, type, skill, difficulty, expected_answer, weight, tags)."
        />
      ) : null}
    </div>
  );
}
