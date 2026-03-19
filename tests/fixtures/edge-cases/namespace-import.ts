import * as vercelKv from "@vercel/kv";
export async function getData() { return vercelKv.kv.get("key"); }
