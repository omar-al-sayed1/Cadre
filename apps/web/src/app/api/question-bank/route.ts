import { createBankQuestion, listBankQuestions } from "@repo/core";
import { questionBankItemSchema } from "@repo/validation";
import { parseBody, route, searchParams } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const GET = route(async (req) => {
  const actor = await getApiActor();
  return { items: await listBankQuestions(actor, searchParams(req)) };
});

export const POST = route(async (req) => {
  const actor = await getApiActor();
  const input = await parseBody(req, questionBankItemSchema);
  return { item: await createBankQuestion(actor, input) };
});
