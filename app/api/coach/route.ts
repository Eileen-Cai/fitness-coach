import { NextResponse } from "next/server";
import { askCoach, MESSAGE_MAX, type CoachStats } from "@/lib/n8n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(message: string) {
  return NextResponse.json(
    { error: "validation_error", message },
    { status: 400 },
  );
}

/** Trust nothing from the client — coerce to a sane, non-negative integer. */
function toCount(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1_000_000) : 0;
}

function readStats(raw: unknown): CoachStats | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  return {
    level: toCount(r.level) || 1,
    streak: toCount(r.streak),
    messages: toCount(r.messages),
  };
}

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return bad("Send a JSON body with a message.");
  }

  const { message, sessionId, stats } = (payload ?? {}) as {
    message?: unknown;
    sessionId?: unknown;
    stats?: unknown;
  };

  if (typeof message !== "string" || message.trim().length === 0) {
    return bad("Add a message before sending.");
  }
  if (message.length > MESSAGE_MAX) {
    return bad(`Keep your message under ${MESSAGE_MAX.toLocaleString()} characters.`);
  }
  if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
    return bad("Missing session. Reload the page and try again.");
  }

  const result = await askCoach({
    message: message.trim(),
    sessionId,
    stats: readStats(stats),
  });

  if (result.ok) {
    return NextResponse.json(
      { reply: result.reply, sessionId: result.sessionId },
      { status: 200 },
    );
  }

  return NextResponse.json(
    { error: result.error, message: result.message },
    { status: result.status },
  );
}
