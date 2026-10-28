import { z } from "zod";
import { requireResearcher } from "@/lib/auth";
import { HttpError, json, route } from "@/lib/http";
import { enforceTimer } from "@/lib/sessions";
import { db } from "@/lib/supabase/admin";
import type { SessionRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = route(async (_req, ctx: RouteContext<"/api/admin/groups/[id]">) => {
  await requireResearcher();
  const { id } = await ctx.params;
  const sb = db();
  const { data: group, error } = await sb.from("study_groups").select("*").eq("id", id).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!group) throw new HttpError(404, "Group not found.");
  const [participants, sessions] = await Promise.all([
    sb.from("participants").select("id, pseudonym, consent, consented_at, created_at").eq("group_id", id).order("created_at"),
    sb.from("sessions").select("*").eq("group_id", id).order("session_number"),
  ]);
  if (participants.error) throw new HttpError(500, participants.error.message);
  if (sessions.error) throw new HttpError(500, sessions.error.message);
  const sessionRows = await Promise.all(((sessions.data ?? []) as SessionRow[]).map(enforceTimer));
  const sessionIds = sessionRows.map((s) => s.id);
  const { data: msgs } = sessionIds.length
    ? await sb.from("messages").select("session_id, participant_id, is_operator, is_masked").in("session_id", sessionIds).limit(20000)
    : { data: [] as { session_id: string; participant_id: string | null; is_operator: boolean; is_masked: boolean }[] };

  return json({
    group,
    participants: (participants.data ?? []).map((p, i) => ({
      ...p,
      label: `P${i + 1}`,
      messages: (msgs ?? []).filter((m) => m.participant_id === p.id).length,
      sessionsJoined: new Set((msgs ?? []).filter((m) => m.participant_id === p.id).map((m) => m.session_id)).size,
    })),
    sessions: sessionRows.map((s) => ({
      ...s,
      messages: (msgs ?? []).filter((m) => m.session_id === s.id && !m.is_operator).length,
      operatorMessages: (msgs ?? []).filter((m) => m.session_id === s.id && m.is_operator).length,
      masked: (msgs ?? []).filter((m) => m.session_id === s.id && m.is_masked).length,
    })),
  });
});

const Patch = z.object({ name: z.string().trim().min(1).max(80).optional(), notes: z.string().trim().max(2000).optional() });

export const PATCH = route(async (req, ctx: RouteContext<"/api/admin/groups/[id]">) => {
  await requireResearcher();
  const { id } = await ctx.params;
  const body = Patch.parse(await req.json());
  const { error } = await db().from("study_groups").update(body).eq("id", id);
  if (error) throw new HttpError(500, error.message);
  return json({ ok: true });
});

export const DELETE = route(async (_req, ctx: RouteContext<"/api/admin/groups/[id]">) => {
  await requireResearcher();
  const { id } = await ctx.params;
  const { error } = await db().from("study_groups").delete().eq("id", id);
  if (error) throw new HttpError(500, error.message);
  return json({ ok: true });
});
