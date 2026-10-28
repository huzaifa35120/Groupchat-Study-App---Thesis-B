// Service-role client. Server only: bypasses row-level security, so every
// route that uses it checks who is calling first.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "../env";

let cached: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (cached) return cached;
  const env = serverEnv();
  if (!env.supabaseUrl || !env.serviceKey) {
    throw new Error("Supabase is not configured (missing URL or service role key).");
  }
  cached = createClient(env.supabaseUrl, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
