// lib/rate-limit.ts

import { kv } from "@vercel/kv";

const RATE_PREFIX = "rate:";
const MAX_MESSAGES = parseInt(
  process.env.CHAT_MAX_MESSAGES_PER_SESSION || "20"
);
const WINDOW_SECONDS = 3600; // 1 hour

export async function checkRateLimit(
  ip: string
): Promise<{ allowed: boolean; remaining: number }> {
  const key = `${RATE_PREFIX}${ip}`;
  const count = (await kv.get<number>(key)) || 0;

  if (count >= MAX_MESSAGES) {
    return { allowed: false, remaining: 0 };
  }

  await kv.set(key, count + 1, { ex: WINDOW_SECONDS });

  return { allowed: true, remaining: MAX_MESSAGES - count - 1 };
}
