// lib/conversation-log.ts

import { kv } from "@vercel/kv";
import type { Conversation, ConversationMessage } from "./types";

const CONV_PREFIX = "conv:";
const CONV_INDEX = "conversations";

export async function createConversation(
  id: string,
  metadata?: Partial<Conversation["metadata"]>
): Promise<Conversation> {
  const conv: Conversation = {
    id,
    timestamp: new Date().toISOString(),
    messages: [],
    metadata: {
      messageCount: 0,
      ...metadata,
    },
  };

  await kv.set(`${CONV_PREFIX}${id}`, conv);
  await kv.lpush(CONV_INDEX, id);

  return conv;
}

export async function appendMessage(
  convId: string,
  message: ConversationMessage
): Promise<void> {
  const conv = await kv.get<Conversation>(`${CONV_PREFIX}${convId}`);
  if (!conv) return;

  conv.messages.push(message);
  conv.metadata.messageCount = conv.messages.length;

  await kv.set(`${CONV_PREFIX}${convId}`, conv);
}

export async function getConversation(
  id: string
): Promise<Conversation | null> {
  return kv.get<Conversation>(`${CONV_PREFIX}${id}`);
}

export async function listConversations(
  limit = 50
): Promise<Conversation[]> {
  const ids = await kv.lrange(CONV_INDEX, 0, limit - 1);
  if (!ids.length) return [];

  const convs = await Promise.all(
    ids.map((id) => kv.get<Conversation>(`${CONV_PREFIX}${id}`))
  );

  return convs.filter(Boolean) as Conversation[];
}
