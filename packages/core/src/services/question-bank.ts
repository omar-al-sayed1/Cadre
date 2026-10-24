import { db, type Prisma } from "@repo/database";
import { AppError } from "@repo/shared";
import {
  formatZodError,
  questionBankItemSchema,
  questionBankQuerySchema,
  questionCsvRowSchema,
  type QuestionBankItemInput,
} from "@repo/validation";
import { requirePermission, type ActorContext } from "../context";
import { parseCsv } from "../utils/csv";

/** Reusable organisation question bank (spec §123). */
export async function listBankQuestions(ctx: ActorContext, rawQuery: Record<string, unknown> = {}) {
  requirePermission(ctx, "template.read");
  const query = questionBankQuerySchema.parse(rawQuery);
  const where: Prisma.QuestionBankItemWhereInput = {
    companyId: ctx.companyId,
    deletedAt: null,
    ...(query.type ? { type: query.type } : {}),
    ...(query.difficulty ? { difficulty: query.difficulty } : {}),
    ...(query.skillId ? { skillId: query.skillId } : {}),
    ...(query.tag ? { tags: { has: query.tag } } : {}),
    ...(query.q ? { text: { contains: query.q, mode: "insensitive" } } : {}),
  };
  return db.questionBankItem.findMany({
    where,
    include: { skill: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
}

export async function createBankQuestion(ctx: ActorContext, rawInput: QuestionBankItemInput) {
  requirePermission(ctx, "questionBank.write");
  const input = questionBankItemSchema.parse(rawInput);
  await assertSkill(ctx, input.skillId ?? null);
  return db.questionBankItem.create({
    data: {
      ...input,
      skillId: input.skillId ?? null,
      companyId: ctx.companyId,
      createdById: ctx.userId,
    },
  });
}

export async function updateBankQuestion(
  ctx: ActorContext,
  id: string,
  rawInput: QuestionBankItemInput,
) {
  requirePermission(ctx, "questionBank.write");
  const input = questionBankItemSchema.parse(rawInput);
  await assertSkill(ctx, input.skillId ?? null);
  const result = await db.questionBankItem.updateMany({
    where: { id, companyId: ctx.companyId, deletedAt: null },
    data: { ...input, skillId: input.skillId ?? null },
  });
  if (result.count === 0) throw new AppError("NOT_FOUND", { message: "Question not found." });
}

export async function deleteBankQuestion(ctx: ActorContext, id: string): Promise<void> {
  requirePermission(ctx, "questionBank.write");
  await db.questionBankItem.updateMany({
    where: { id, companyId: ctx.companyId },
    data: { deletedAt: new Date() },
  });
}

async function assertSkill(ctx: ActorContext, skillId: string | null): Promise<void> {
  if (!skillId) return;
  const skill = await db.skill.findFirst({
    where: { id: skillId, companyId: ctx.companyId },
    select: { id: true },
  });
  if (!skill) throw new AppError("VALIDATION_FAILED", { message: "Unknown skill." });
}

/** CSV import architecture (spec §124): question,type,skill,difficulty,expected_answer,weight,tags */
export async function importBankQuestionsCsv(ctx: ActorContext, csvText: string) {
  requirePermission(ctx, "questionBank.write");
  const { rows } = parseCsv(csvText);
  const skills = await db.skill.findMany({
    where: { companyId: ctx.companyId },
    select: { id: true, name: true },
  });
  const skillByName = new Map(skills.map((s) => [s.name.toLowerCase(), s.id]));
  const errors: Array<{ row: number; errors: Record<string, string[]> }> = [];
  let created = 0;
  for (const [index, row] of rows.entries()) {
    const parsed = questionCsvRowSchema.safeParse(row);
    if (!parsed.success) {
      errors.push({ row: index + 2, errors: formatZodError(parsed.error) });
      continue;
    }
    const r = parsed.data;
    await db.questionBankItem.create({
      data: {
        companyId: ctx.companyId,
        createdById: ctx.userId,
        text: r.question,
        type: r.type,
        difficulty: r.difficulty,
        skillId: r.skill ? (skillByName.get(r.skill.toLowerCase()) ?? null) : null,
        idealAnswer: r.expected_answer,
        weight: r.weight,
        tags: r.tags
          ? r.tags
              .split(/[;|]/)
              .map((t) => t.trim())
              .filter(Boolean)
              .slice(0, 15)
          : [],
      },
    });
    created += 1;
  }
  return { created, errors };
}
