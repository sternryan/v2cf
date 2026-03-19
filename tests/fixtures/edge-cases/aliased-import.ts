import { kv as store } from "@vercel/kv";
export async function getData() { return store.get("key"); }
