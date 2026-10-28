import { requireResearcher } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { withdrawParticipant } from "@/lib/withdraw";

// Researcher-initiated withdrawal (e.g. a participant asked by email).
export const DELETE = route(async (_req, ctx: RouteContext<"/api/admin/participants/[id]">) => {
  await requireResearcher();
  const { id } = await ctx.params;
  const result = await withdrawParticipant(id, "researcher");
  return json({ ok: true, ...result });
});
