import { getServerEnv } from "@repo/config/env";

/**
 * HTTP for the free, open-data services the prospecting agent uses
 * (OpenStreetMap Overpass, Wikidata). These endpoints are fixed by
 * configuration — never taken from user input — and their usage policies ask
 * for an identifying User-Agent, modest volume and spacing between requests.
 */

const lastCall = new Map<string, number>();
const MIN_SPACING_MS = 1_100;

function userAgent(): string {
  let appUrl = "";
  try {
    appUrl = getServerEnv().APP_URL;
  } catch {
    // tests without env
  }
  return `CadreProspectingAgent/1.0 (+${appUrl || "https://example.com"}/legal/privacy)`;
}

async function spaced(host: string): Promise<void> {
  const wait = (lastCall.get(host) ?? 0) + MIN_SPACING_MS - Date.now();
  lastCall.set(host, Date.now() + Math.max(0, wait));
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

export class OpenDataError extends Error {
  constructor(
    readonly source: string,
    message: string,
  ) {
    super(message);
    this.name = "OpenDataError";
  }
}

export async function openDataJson<T>(
  source: string,
  url: string,
  init: {
    method?: "GET" | "POST";
    body?: URLSearchParams;
    timeoutMs?: number;
    accept?: string;
    /** Wait and retry once when the service is busy (off when the caller has mirrors). */
    retryBusy?: boolean;
  } = {},
  retried = false,
): Promise<T> {
  const target = new URL(url);
  await spaced(target.host);
  let response: Response;
  try {
    response = await fetch(target, {
      method: init.method ?? "GET",
      body: init.body,
      headers: {
        "user-agent": userAgent(),
        accept: init.accept ?? "application/json",
        ...(init.body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      },
      signal: AbortSignal.timeout(init.timeoutMs ?? 45_000),
    });
  } catch (error) {
    throw new OpenDataError(
      source,
      error instanceof Error && error.name === "TimeoutError"
        ? `${source} took too long to respond`
        : `${source} couldn't be reached`,
    );
  }
  if (response.status === 429 || response.status === 503 || response.status === 504) {
    // Busy: honour Retry-After once (capped), then give up politely.
    if (!retried && init.retryBusy !== false) {
      const after = Number(response.headers.get("retry-after"));
      const waitMs = Math.min(15_000, Number.isFinite(after) && after > 0 ? after * 1_000 : 5_000);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return openDataJson<T>(source, url, init, true);
    }
    throw new OpenDataError(source, `${source} is busy right now`);
  }
  if (!response.ok)
    throw new OpenDataError(source, `${source} returned an error (${response.status})`);
  try {
    return (await response.json()) as T;
  } catch {
    throw new OpenDataError(source, `${source} sent an unreadable response`);
  }
}
