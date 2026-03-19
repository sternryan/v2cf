// app/api/chat/route.ts

import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { buildSystemPrompt } from "@/lib/system-prompt";
import {
  createConversation,
  appendMessage,
  getConversation,
} from "@/lib/conversation-log";
import { checkRateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { randomUUID } from "crypto";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const headersList = headers();
    const ip =
      headersList.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const userAgent = headersList.get("user-agent") || "unknown";

    // Rate limit check
    const { allowed, remaining } = await checkRateLimit(ip);
    if (!allowed) {
      return new Response(
        JSON.stringify({
          error:
            "You've reached the message limit for this session. Feel free to reach out to ryan@quartermint.com to continue the conversation.",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    const { messages, conversationId } = await req.json();
    const convId = conversationId || randomUUID();

    // Create or retrieve conversation
    let conv = await getConversation(convId);
    if (!conv) {
      conv = await createConversation(convId, { ip, userAgent });
    }

    // Log user message
    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage?.role === "user") {
      await appendMessage(convId, {
        ...lastUserMessage,
        timestamp: new Date().toISOString(),
      });
    }

    const model = process.env.CHAT_MODEL || "claude-sonnet-4-6";

    const result = await streamText({
      model: anthropic(model),
      system: buildSystemPrompt(),
      messages,
      onFinish: async ({ text }) => {
        // Log assistant response
        await appendMessage(convId, {
          role: "assistant",
          content: text,
          timestamp: new Date().toISOString(),
        });
      },
    });

    return result.toDataStreamResponse({
      headers: {
        "X-Conversation-Id": convId,
        "X-Rate-Limit-Remaining": remaining.toString(),
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({
        error:
          "I'm temporarily offline. Reach out to ryan@quartermint.com — the written deliverables are still available on the main page.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
