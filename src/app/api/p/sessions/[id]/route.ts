import { HttpError, json, route } from "@/lib/http";
import { requireParticipant } from "@/lib/participants";
import { enforceTimer, getMessages, getSession } from "@/lib/sessions";
import type { PublicMessage } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = route(async (req, ctx: RouteContext<"/api/p/sessions/[id]">) => {
  const { id } = await ctx.params;
  const me = await requireParticipant(req);
  const session = await enforceTimer(await getSession(id));
  if (session.group_id !== me.group_id) throw new HttpError(403, "This session belongs to a different group.");

  const after = Number(new URL(req.url).searchParams.get("after") ?? 0) || 0;
  const messages: PublicMessage[] =
    session.status === "scheduled"
      ? []
      : (await getMessages(id, after)).map((m) => ({
          id: m.id,
          author: m.author_label,
          body: m.body,
          at: m.created_at,
          mine: m.participant_id === me.id,
          operator: m.is_operator,
        }));

  return json({
    me: { pseudonym: me.pseudonym, groupCode: me.group.code },
    session: {
      id: session.id,
      number: session.session_number,
      title: session.title,
      topic: session.status === "scheduled" ? null : session.topic,
      status: session.status,
      durationSeconds: session.duration_seconds,
      startedAt: session.started_at,
      endsAt: session.ends_at,
      endedAt: session.ended_at,
    },
    messages,
    serverNow: new Date().toISOString(),
  });
});
