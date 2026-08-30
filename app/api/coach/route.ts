import { NextResponse } from "next/server";
import { askCoach, MESSAGE_MAX } from "@/lib/n8n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(message: string) {
  return NextResponse.json(
    { error: "validation_error", message },
    { status: 400 },
  );
}

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return bad("Send a JSON body with a message.");
  }

  const { message, sessionId } = (payload ?? {}) as {
    message?: unknown;
    sessionId?: unknown;
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

  const result = await askCoach({ message: message.trim(), sessionId });

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
