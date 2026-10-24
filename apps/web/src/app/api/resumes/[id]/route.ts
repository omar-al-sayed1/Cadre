import { NextResponse } from "next/server";
import { getResumeFile } from "@repo/core";
import { route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  const { file, resume } = await getResumeFile(actor, params.id);
  return new NextResponse(file.body as Uint8Array<ArrayBuffer>, {
    headers: {
      "content-type": file.contentType,
      "content-disposition": `attachment; filename="${resume.originalFilename.replace(/"/g, "")}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});
