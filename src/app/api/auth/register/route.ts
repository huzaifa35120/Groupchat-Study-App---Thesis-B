import { z } from "zod";
import { isAllowedEmail } from "@/lib/auth";
import { HttpError, json, route } from "@/lib/http";
import { db } from "@/lib/supabase/admin";

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10, "Use at least 10 characters"),
});

// Creates a researcher account, but only for emails listed in ADMIN_EMAILS.
export const POST = route(async (req) => {
  const { email, password } = Body.parse(await req.json());
  if (!isAllowedEmail(email)) throw new HttpError(403, "This email isn't on the researcher list (ADMIN_EMAILS).");
  const sb = db();
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    if (/already/i.test(error.message)) throw new HttpError(409, "An account already exists for this email. Sign in instead.");
    throw new HttpError(400, error.message);
  }
  await sb.from("researchers").upsert({ user_id: data.user.id, email }, { onConflict: "user_id" });
  return json({ ok: true });
});
