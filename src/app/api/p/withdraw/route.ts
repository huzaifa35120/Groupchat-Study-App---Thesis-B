import { json, route } from "@/lib/http";
import { requireParticipant } from "@/lib/participants";
import { withdrawParticipant } from "@/lib/withdraw";

export const POST = route(async (req) => {
  const me = await requireParticipant(req);
  const result = await withdrawParticipant(me.id, "participant");
  return json({ ok: true, ...result });
});
