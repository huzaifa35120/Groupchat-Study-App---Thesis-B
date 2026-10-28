import { requireResearcher } from "@/lib/auth";
import { fetchAll } from "@/lib/fetch-all";
import { HttpError, json, route } from "@/lib/http";
import { speakerLabels } from "@/lib/participants";
import { getRun, runProgress } from "@/lib/runs";
import { db } from "@/lib/supabase/admin";
import type { PredictionRow, ScoreRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = route(async (_req, ctx: RouteContext<"/api/admin/runs/[id]">) => {
  const researcher = await requireResearcher();
  const { id } = await ctx.params;
  const run = await getRun(id);
  const sb = db();
  const predictions = await fetchAll<PredictionRow>(() =>
    sb.from("predictions").select("*").eq("run_id", id).order("session_id").order("position_index"),
  );
  const scores = await fetchAll<ScoreRow>(() =>
    sb.from("scores").select("*, predictions!inner(run_id)").eq("predictions.run_id", id).order("id"),
  );
  const { data: sessions } = await sb
    .from("sessions")
    .select("id, group_id, session_number, title, topic, group:study_groups(name)")
    .in("id", run.session_ids);
  const messages = await fetchAll<{ id: number; participant_id: string | null; msg_type: string | null }>(() =>
    sb.from("messages").select("id, participant_id, msg_type").in("session_id", run.session_ids).eq("is_operator", false).order("id"),
  );
  const labelMaps = new Map<string, Map<string, string>>();
  for (const s of sessions ?? []) {
    if (!labelMaps.has(s.group_id)) labelMaps.set(s.group_id, await speakerLabels(s.group_id));
  }
  const sessionInfo = new Map(
    (sessions ?? []).map((s) => [
      s.id,
      { label: `${(s.group as unknown as { name: string } | null)?.name ?? "Group"} · S${s.session_number}`, groupId: s.group_id },
    ]),
  );
  const messageInfo = new Map(messages.map((m) => [m.id, m]));

  return json({
    run,
    me: researcher.email,
    progress: await runProgress(id),
    predictions: predictions.map((p) => {
      const info = sessionInfo.get(p.session_id);
      const msg = messageInfo.get(p.message_id);
      return {
        ...p,
        sessionLabel: info?.label ?? "(deleted session)",
        speaker: msg?.participant_id && info ? labelMaps.get(info.groupId)?.get(msg.participant_id) ?? "P?" : "P?",
        msgType: msg?.msg_type ?? null,
        scores: scores.filter((s) => s.prediction_id === p.id),
      };
    }),
  });
});

export const DELETE = route(async (_req, ctx: RouteContext<"/api/admin/runs/[id]">) => {
  await requireResearcher();
  const { id } = await ctx.params;
  const { error } = await db().from("prediction_runs").delete().eq("id", id);
  if (error) throw new HttpError(500, error.message);
  return json({ ok: true });
});
