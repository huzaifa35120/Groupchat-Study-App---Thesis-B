import { z } from "zod";
import { requireResearcher } from "@/lib/auth";
import { HttpError, json, route } from "@/lib/http";
import { DEFAULT_MASK_OPTIONS, validateMasks } from "@/lib/masking";
import { speakerLabels } from "@/lib/participants";
import { enforceTimer, getMessages, getSession } from "@/lib/sessions";
import { db } from "@/lib/supabase/admin";
import { messageFeatures } from "@/lib/text/features";

export const dynamic = "force-dynamic";

export const GET = route(async (_req, ctx: RouteContext<"/api/admin/sessions/[id]">) => {
  await requireResearcher();
  const { id } = await ctx.params;
  const session = await enforceTimer(await getSession(id));
  const sb = db();
  const [{ data: group }, messages, labels, { data: participants }] = await Promise.all([
    sb.from("study_groups").select("id, name, code").eq("id", session.group_id).single(),
    getMessages(id),
    speakerLabels(session.group_id),
    sb.from("participants").select("id, pseudonym").eq("group_id", session.group_id).order("created_at"),
  ]);

  let seq = 0;
  const rows = messages.map((m) => {
    const f = messageFeatures(m.body);
    return {
      ...m,
      seq: m.is_operator ? null : ++seq,
      speaker: m.participant_id ? labels.get(m.participant_id) ?? "P?" : null,
      words: f.words,
      lengthClass: f.lengthClass,
    };
  });
  const options = session.mask_config ?? DEFAULT_MASK_OPTIONS;
  const warnings = validateMasks(
    rows.map((m) => ({ id: m.id, isOperator: m.is_operator, lengthClass: m.lengthClass })),
    new Set(rows.filter((m) => m.is_masked).map((m) => m.id)),
    options,
  );

  return json({
    session,
    group,
    participants: (participants ?? []).map((p) => ({ ...p, label: labels.get(p.id) })),
    messages: rows,
    maskWarnings: warnings,
    serverNow: new Date().toISOString(),
  });
});

const Patch = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  topic: z.string().trim().min(1).max(500).optional(),
  durationSeconds: z.number().int().min(60).max(7200).optional(),
});

export const PATCH = route(async (req, ctx: RouteContext<"/api/admin/sessions/[id]">) => {
  await requireResearcher();
  const { id } = await ctx.params;
  const body = Patch.parse(await req.json());
  const update: Record<string, unknown> = {};
  if (body.title !== undefined) update.title = body.title;
  if (body.topic !== undefined) update.topic = body.topic;
  if (body.durationSeconds !== undefined) update.duration_seconds = body.durationSeconds;
  const { error } = await db().from("sessions").update(update).eq("id", id);
  if (error) throw new HttpError(500, error.message);
  return json({ ok: true });
});

export const DELETE = route(async (_req, ctx: RouteContext<"/api/admin/sessions/[id]">) => {
  await requireResearcher();
  const { id } = await ctx.params;
  const { error } = await db().from("sessions").delete().eq("id", id);
  if (error) throw new HttpError(500, error.message);
  return json({ ok: true });
});
