import { json, route } from "@/lib/http";
import { requireParticipant } from "@/lib/participants";

export const POST = route(async (req) => {
  const me = await requireParticipant(req);
  return json({ pseudonym: me.pseudonym, group: { code: me.group.code, name: me.group.name } });
});
