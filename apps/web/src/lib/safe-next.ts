/** Only relative, same-site redirect targets are allowed (no open redirects). */
export function safeNext(next: string | null | undefined): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : null;
}

/** Append `?next=` to an auth page link when there is somewhere to return to. */
export function withNext(path: string, next: string | null): string {
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}

const INVITE_PATH = /^\/invite\/([A-Za-z0-9_-]{16,200})$/;

/** The team-invitation token when `next` points at an invite page. */
export function inviteTokenFrom(next: string | null): string | null {
  return next?.match(INVITE_PATH)?.[1] ?? null;
}
