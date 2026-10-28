"use client";
// Browser client: researcher sign-in and Realtime channels (presence, typing
// and "new message" pings). Message content never travels over Realtime.
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "../env";

let cached: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient | null {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) return null;
  cached ??= createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
  return cached;
}
