import { checkModelAccess, describeError } from "@/lib/ai/claude";
import { DEFAULT_MODEL } from "@/lib/constants";
import { isConfigured, serverEnv } from "@/lib/env";
import { json } from "@/lib/http";
import { db } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Setup check (no secrets): is each piece of configuration present and working?
// ?deep=1 also asks the Anthropic API whether the key can use the default model.
export async function GET(req: Request) {
  const env = serverEnv();
  const result = {
    supabaseConfigured: isConfigured(),
    database: "unchecked" as string,
    anthropicConfigured: env.anthropicConfigured,
    anthropic: "unchecked" as string,
    researcherEmails: env.adminEmails.length,
  };
  if (result.supabaseConfigured) {
    const { error } = await db().from("sessions").select("id", { head: true, count: "exact" });
    result.database = error ? `error: ${error.message}` : "ok";
  }
  if (env.anthropicConfigured && new URL(req.url).searchParams.get("deep") === "1") {
    try {
      result.anthropic = `ok (${await checkModelAccess(DEFAULT_MODEL)})`;
    } catch (err) {
      result.anthropic = `error: ${describeError(err)}`;
    }
  }
  return json(result);
}
