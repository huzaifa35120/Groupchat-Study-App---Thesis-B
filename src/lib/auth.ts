// Researcher access: a Supabase Auth user whose email is listed in ADMIN_EMAILS.
import { serverEnv } from "./env";
import { HttpError } from "./http";
import { supabaseServer } from "./supabase/server";

export interface Researcher {
  id: string;
  email: string;
}

export function isAllowedEmail(email: string): boolean {
  return serverEnv().adminEmails.includes(email.trim().toLowerCase());
}

export async function getResearcher(): Promise<Researcher | null> {
  try {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email?.toLowerCase();
    if (!data.user || !email || !isAllowedEmail(email)) return null;
    return { id: data.user.id, email };
  } catch {
    return null;
  }
}

export async function requireResearcher(): Promise<Researcher> {
  const researcher = await getResearcher();
  if (!researcher) throw new HttpError(401, "Researcher sign-in required.");
  return researcher;
}
