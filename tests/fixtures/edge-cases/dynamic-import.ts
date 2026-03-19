export async function lazyKv() {
  const { kv } = await import("@vercel/kv");
  return kv.get("key");
}
