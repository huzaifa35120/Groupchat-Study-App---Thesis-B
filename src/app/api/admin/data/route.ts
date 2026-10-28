import { requireResearcher } from "@/lib/auth";
import { HttpError, json, route } from "@/lib/http";
import { db } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireResearcher();
  const sb = db();
  const [requests, withdrawals] = await Promise.all([
    sb.from("summary_requests").select("*").order("created_at"),
    sb.from("withdrawal_log").select("*").order("created_at"),
  ]);
  if (requests.error) throw new HttpError(500, requests.error.message);
  if (withdrawals.error) throw new HttpError(500, withdrawals.error.message);
  return json({ summaryRequests: requests.data, withdrawals: withdrawals.data });
});

// Deletes the "send me the summary" email list (e.g. once summaries are sent).
export const DELETE = route(async () => {
  await requireResearcher();
  const { error } = await db().from("summary_requests").delete().not("id", "is", null);
  if (error) throw new HttpError(500, error.message);
  return json({ ok: true });
});
