import { z } from "zod";
import { HttpError, json, route } from "@/lib/http";
import { requireParticipant } from "@/lib/participants";
import { enforceTimer, getSession } from "@/lib/sessions";
import { db } from "@/lib/supabase/admin";
import type { MessageRow, PublicMessage } from "@/lib/types";

const Body = z.object({
  body: z.string().trim().min(1).max(2000),
  clientId: z.string().uuid(),
});

export const POST = route(async (req, ctx: RouteContext<"/api/p/sessions/[id]/messages">) => {
  const { id } = await ctx.params;
  const me = await requireParticipant(req);
  const { body, clientId } = Body.parse(await req.json());
  const session = await enforceTimer(await getSession(id));
  if (session.group_id !== me.group_id) throw new HttpError(403, "This session belongs to a different group.");
  if (session.status !== "live") {
    throw new HttpError(409, session.status === "ended" ? "This session has ended." : "This session hasn't started yet.");
  }

  const sb = db();
  let row: MessageRow | null = null;
  const { data, error } = await sb
    .from("messages")
    .insert({
      session_id: id,
      participant_id: me.id,
      is_operator: false,
      author_label: me.pseudonym,
      body,
      client_id: clientId,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code !== "23505") throw new HttpError(500, error.message);
    // Retry of a message we already stored
    const existing = await sb.from("messages").select("*").eq("session_id", id).eq("client_id", clientId).single();
    row = existing.data as MessageRow;
  } else {
    row = data as MessageRow;
  }

  const message: PublicMessage = {
    id: row.id,
    author: row.author_label,
    body: row.body,
    at: row.created_at,
    mine: true,
    operator: false,
  };
  return json({ message });
});
