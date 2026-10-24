import { NextResponse } from "next/server";
import { db } from "@repo/database";
import { getStorage } from "@repo/storage";
import { route } from "@/server/api";

/** Company logos are public branding (shown to candidates). */
export const GET = route<{ id: string }>(async (_req, { params }) => {
  const company = await db.company.findUnique({
    where: { id: params.id },
    select: { logoKey: true },
  });
  if (!company?.logoKey) return new NextResponse(null, { status: 404 });
  const file = await getStorage().get(company.logoKey);
  if (!file) return new NextResponse(null, { status: 404 });
  return new NextResponse(file.body as Uint8Array<ArrayBuffer>, {
    headers: {
      "content-type": file.contentType,
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
});
