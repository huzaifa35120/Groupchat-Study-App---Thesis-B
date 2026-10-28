import { z } from "zod";
import { requireResearcher } from "@/lib/auth";
import { MSG_TYPE_IDS, OPERATOR_LABEL } from "@/lib/constants";
import { HttpError, json, route } from "@/lib/http";
import { enforceTimer, getSession } from "@/lib/sessions";
import { db } from "@/lib/supabase/admin";
import type { MessageRow } from "@/lib/types";

const Post = z.object({ body: z.string().trim().min(1).max(2000), clientId: z.string().uuid() });

// The researcher joins the chat as the moderator. These messages are stored and
// shown to participants but flagged so they never enter the analysis.
export const POST = route(async (req, ctx: RouteContext<"/api/admin/sessions/[id]/messages">) => {
  await requireResearcher();
  const { id } = await ctx.params;
  const { body, clientId } = Post.parse(await req.json());
  const session = await enforceTimer(await getSession(id));
  if (session.status === "ended") throw new HttpError(409, "This session has ended.");
  const { data, error } = await db()
    .from("messages")
    .insert({ session_id: id, is_operator: true, author_label: OPERATOR_LABEL, body, client_id: clientId })
    .select("*")
    .single();
  if (error && error.code !== "23505") throw new HttpError(500, error.message);
  return json({ message: data as MessageRow | null });
});

const Patch = z.object({
  messageId: z.number().int(),
  isMasked: z.boolean().optional(),
  msgType: z.enum(MSG_TYPE_IDS).nullable().optional(),
});

// Hand-edit a gap or set a message's type.
export const PATCH = route(async (req, ctx: RouteContext<"/api/admin/sessions/[id]/messages">) => {
  await requireResearcher();
  const { id } = await ctx.params;
  const body = Patch.parse(await req.json());
  const sb = db();
  const { data: msg, error } = await sb.from("messages").select("*").eq("id", body.messageId).eq("session_id", id).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!msg) throw new HttpError(404, "Message not found in this session.");
  if (body.isMasked && msg.is_operator) throw new HttpError(400, "Moderator messages can't be masked.");

  const update: Record<string, unknown> = {};
  if (body.isMasked !== undefined) update.is_masked = body.isMasked;
  if (body.msgType !== undefined) update.msg_type = body.msgType;
  const { error: upError } = await sb.from("messages").update(update).eq("id", body.messageId);
  if (upError) throw new HttpError(500, upError.message);

  if (body.isMasked !== undefined && body.isMasked !== msg.is_masked) {
    const session = await getSession(id);
    const { count } = await sb.from("messages").select("id", { count: "exact", head: true }).eq("session_id", id).eq("is_masked", true);
    const maskConfig = session.mask_config
      ? { ...session.mask_config, edited: true, count: count ?? 0 }
      : { method: "manual", generatedAt: new Date().toISOString(), count: count ?? 0, ratio: 0, seed: 0, skipFirst: 3, protectLast: true, noAdjacent: true, stratify: false };
    await sb.from("sessions").update({ mask_config: maskConfig }).eq("id", id);
  }
  return json({ ok: true });
});
