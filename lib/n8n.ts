import "server-only";

/**
 * Server-side bridge to the n8n "Fitness Coach" workflow.
 * The browser never talks to n8n directly — it calls /api/coach, which calls this.
 *
 * Data contract (see apps/fitness-coach/CLAUDE.md):
 *   POST {N8N_WEBHOOK_BASE_URL}/webhook/{N8N_WEBHOOK_PATH}
 *   body    -> { message: string (1..4000), sessionId: string }
 *   200     -> { reply: string, sessionId: string }
 *   400/500 -> { error: string, message: string }
 */

const BASE_URL = process.env.N8N_WEBHOOK_BASE_URL;
const WEBHOOK_PATH = process.env.N8N_WEBHOOK_PATH ?? "fitness-coach";
const AUTH_HEADER = process.env.N8N_WEBHOOK_TOKEN; // optional, unused today
const TIMEOUT_MS = 120_000;

export const MESSAGE_MAX = 4000;

export type CoachRequest = { message: string; sessionId: string };

export type CoachResult =
  | { ok: true; reply: string; sessionId: string }
  | { ok: false; status: number; error: string; message: string };

function fail(status: number, error: string, message: string): CoachResult {
  return { ok: false, status, error, message };
}

export async function askCoach({
  message,
  sessionId,
}: CoachRequest): Promise<CoachResult> {
  if (!BASE_URL) {
    return fail(
      500,
      "config_error",
      "The coach isn't connected yet. Set N8N_WEBHOOK_BASE_URL and restart the server.",
    );
  }

  const url = `${BASE_URL.replace(/\/+$/, "")}/webhook/${WEBHOOK_PATH}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Skip ngrok's free-tier browser interstitial when n8n sits behind a tunnel.
        "ngrok-skip-browser-warning": "1",
        ...(AUTH_HEADER ? { authorization: AUTH_HEADER } : {}),
      },
      body: JSON.stringify({ message, sessionId }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    clearTimeout(timer);
    const aborted = err instanceof Error && err.name === "AbortError";
    return fail(
      504,
      aborted ? "timeout" : "network_error",
      aborted
        ? "The coach took too long to answer. Try again."
        : "Couldn't reach the coach. Check that n8n is running, then try again.",
    );
  }
  clearTimeout(timer);

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* fall through to shape check */
  }

  const data = (body ?? {}) as Record<string, unknown>;

  if (res.ok && typeof data.reply === "string") {
    return {
      ok: true,
      reply: data.reply,
      sessionId: typeof data.sessionId === "string" ? data.sessionId : sessionId,
    };
  }

  // Pass through the workflow's structured error, else a sanitized default.
  const error = typeof data.error === "string" ? data.error : "internal_error";
  const humanMessage =
    typeof data.message === "string" && data.message
      ? data.message
      : "The coach is unavailable right now. Please try again shortly.";
  return fail(res.status >= 400 ? res.status : 502, error, humanMessage);
}
