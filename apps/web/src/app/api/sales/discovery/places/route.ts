import { searchPlaces } from "@repo/core";
import { route } from "@/server/api";
import { getApiActor } from "@/server/auth-context";

/** Place search for the Find leads map (geocoded on the server). */
export const GET = route(async (req) => {
  const actor = await getApiActor();
  return { places: await searchPlaces(actor, { q: req.nextUrl.searchParams.get("q") ?? "" }) };
});
