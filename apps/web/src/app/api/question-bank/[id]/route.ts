import { deleteBankQuestion, updateBankQuestion } from "@repo/core";
import { questionBankItemSchema } from "@repo/validation";
import { parseBody, route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const PUT = route<{ id: string }>(async (req, { params }) => {
  const actor = await getApiActor();
  const input = await parseBody(req, questionBankItemSchema);
  await updateBankQuestion(actor, params.id, input);
  return { ok: true };
});

export const DELETE = route<{ id: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  await deleteBankQuestion(actor, params.id);
  return { ok: true };
});
