import { publishTemplate } from "@repo/core";
import { route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

/** Publish the draft as a new immutable version. In-flight interviews keep their version. */
export const POST = route<{ id: string }>(async (_req, { params }) => {
  const actor = await getApiActor();
  const version = await publishTemplate(actor, params.id);
  return {
    version: { id: version.id, version: version.version, publishedAt: version.publishedAt },
  };
});
