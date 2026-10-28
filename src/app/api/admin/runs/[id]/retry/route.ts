import { requireResearcher } from "@/lib/auth";
import { HttpError, json, route } from "@/lib/http";
import { updateRunStatus } from "@/lib/runs";
import { db } from "@/lib/supabase/admin";

// Puts failed gaps back in the queue.
export const POST = route(async (_req, ctx: RouteContext<"/api/admin/runs/[id]/retry">) => {
  await requireResearcher();
  const { id } = await ctx.params;
  const { error } = await db()
    .from("predictions")
    .update({ status: "pending", error: null, attempts: 0, claimed_at: null })
    .eq("run_id", id)
    .eq("status", "error");
  if (error) throw new HttpError(500, error.message);
  return json({ progress: await updateRunStatus(id) });
});
