import { describePlace } from "@repo/core";
import { route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

/** The place name at a point clicked on the Find leads map. */
export const GET = route(async (req) => {
  const actor = await getApiActor();
  const params = req.nextUrl.searchParams;
  return { place: await describePlace(actor, { lat: params.get("lat"), lon: params.get("lon") }) };
});
