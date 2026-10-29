import { safeValidateUIMessages } from "ai";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { answerChat } from "@/lib/chat/answer";
import { chatFallbackModel, chatModel } from "@/lib/chat/model";
import { createClient } from "@/lib/supabase/server";

const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: Request) {
  const session = await getSession();
  if (session.status !== "member") return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const model = await chatModel();
  if (!model) return NextResponse.json({ error: "Chat is not set up yet" }, { status: 503 });

  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "This chat is too long. Start a new chat." }, { status: 413 });
  }
  const payload: unknown = (() => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  })();
  const messages = await safeValidateUIMessages({
    messages: typeof payload === "object" && payload !== null && "messages" in payload ? payload.messages : null,
  });
  if (!messages.success) return NextResponse.json({ error: "messages required" }, { status: 400 });

  return answerChat({ messages: messages.data, db: await createClient(), model, fallbackModel: chatFallbackModel() });
}
