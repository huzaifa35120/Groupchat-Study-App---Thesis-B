import { isConfigured, serverEnv } from "@/lib/env";
import { json } from "@/lib/http";
import { db } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Setup check (no secrets): is each piece of configuration present and working?
export async function GET() {
  const env = serverEnv();
  const result = {
    supabaseConfigured: isConfigured(),
    database: "unchecked" as string,
    anthropicConfigured: env.anthropicConfigured,
    researcherEmails: env.adminEmails.length,
  };
  if (result.supabaseConfigured) {
    const { error } = await db().from("sessions").select("id", { head: true, count: "exact" });
    result.database = error ? `error: ${error.message}` : "ok";
  }
  return json(result);
}
