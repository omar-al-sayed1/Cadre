import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic route protection: redirect signed-out visitors away from the
 * recruiter app before rendering. Real authorization happens server-side in
 * every page and route handler.
 */
const PROTECTED_PREFIXES = [
  "/home",
  "/marketplace",
  "/sales",
  "/dashboard",
  "/jobs",
  "/candidates",
  "/interviews",
  "/compare",
  "/analytics",
  "/question-bank",
  "/settings",
  "/onboarding",
  "/admin",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);

  if (
    PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  ) {
    const sessionCookie = getSessionCookie(request, { cookiePrefix: "aii" });
    if (!sessionCookie) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
