import { NextResponse } from "next/server";
import { requirePermission } from "@repo/core";
import { db } from "@repo/database";
import { AppError } from "@repo/shared";
import { getStorage } from "@repo/storage";
import { route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

/** Stream a candidate audio recording to authorised team members. */
export const GET = route<{ id: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  requirePermission(actor, "results.read");
  const recording = await db.recording.findFirst({
    where: { id: params.id, deletedAt: null, session: { companyId: actor.companyId } },
  });
  if (!recording) throw new AppError("NOT_FOUND", { message: "Recording not found." });
  const file = await getStorage().get(recording.storageKey);
  if (!file) throw new AppError("NOT_FOUND", { message: "Recording not found." });
  return new NextResponse(file.body as Uint8Array<ArrayBuffer>, {
    headers: {
      "content-type": recording.mimeType,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});
