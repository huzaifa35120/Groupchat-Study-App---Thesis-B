// Session lifecycle: lazy timer enforcement, ending, recording statistics and
// choosing the gaps.
import { computeSessionStats } from "./analysis/session-stats";
import { HttpError } from "./http";
import { DEFAULT_MASK_OPTIONS, selectMasks, type MaskOptions } from "./masking";
import { speakerLabels } from "./participants";
import { db } from "./supabase/admin";
import { lengthClass } from "./text/features";
import type { MaskConfig, MessageRow, SessionRow } from "./types";

export async function getSession(id: string): Promise<SessionRow> {
  const { data, error } = await db().from("sessions").select("*").eq("id", id).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "Session not found.");
  return data as SessionRow;
}

export async function getMessages(sessionId: string, afterId = 0): Promise<MessageRow[]> {
  const { data, error } = await db()
    .from("messages")
    .select("*")
    .eq("session_id", sessionId)
    .gt("id", afterId)
    .order("id", { ascending: true })
    .limit(5000);
  if (error) throw new HttpError(500, error.message);
  return (data ?? []) as MessageRow[];
}

export async function recordSessionStats(session: SessionRow): Promise<SessionRow> {
  const [messages, labels] = await Promise.all([getMessages(session.id), speakerLabels(session.group_id)]);
  const participantMessages = messages.filter((m) => !m.is_operator && m.participant_id);
  const stats = computeSessionStats({
    messages: participantMessages.map((m) => ({
      participantId: m.participant_id!,
      speaker: labels.get(m.participant_id!) ?? "P?",
      body: m.body,
      createdAt: m.created_at,
    })),
    operatorMessages: messages.length - participantMessages.length,
    plannedDurationSec: session.duration_seconds,
    startedAt: session.started_at,
    endedAt: session.ended_at,
  });
  const { data, error } = await db()
    .from("sessions")
    .update({ stats, stats_computed_at: stats.computedAt })
    .eq("id", session.id)
    .select("*")
    .single();
  if (error) throw new HttpError(500, error.message);
  return data as SessionRow;
}

// Ends a live session. Only the caller that flips the status records stats, so
// concurrent pollers can't race each other.
export async function endSession(session: SessionRow, endedAt: string): Promise<SessionRow> {
  const { data, error } = await db()
    .from("sessions")
    .update({ status: "ended", ended_at: endedAt })
    .eq("id", session.id)
    .eq("status", "live")
    .select("*")
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) return getSession(session.id);
  const recorded = await recordSessionStats(data as SessionRow);
  return ensureGaps(recorded);
}

// Replaces the session's gaps with a seeded random selection.
export async function applyMaskSelection(sessionId: string, options: MaskOptions, auto = false) {
  const messages = await getMessages(sessionId);
  const selection = selectMasks(
    messages.map((m) => ({ id: m.id, isOperator: m.is_operator, lengthClass: lengthClass(m.body) })),
    options,
  );
  const sb = db();
  const { error: clearError } = await sb.from("messages").update({ is_masked: false }).eq("session_id", sessionId).eq("is_masked", true);
  if (clearError) throw new HttpError(500, clearError.message);
  if (selection.ids.length) {
    const { error } = await sb.from("messages").update({ is_masked: true }).in("id", selection.ids);
    if (error) throw new HttpError(500, error.message);
  }
  const maskConfig: MaskConfig = { ...options, method: "random", auto, generatedAt: new Date().toISOString(), count: selection.ids.length };
  const { data, error } = await sb.from("sessions").update({ mask_config: maskConfig }).eq("id", sessionId).select("*").single();
  if (error) throw new HttpError(500, error.message);
  return { selection, session: data as SessionRow };
}

// Gaps are picked automatically, with the default rules, once a session has
// ended. A session whose gaps were already picked, edited or cleared is left alone.
export async function ensureGaps(session: SessionRow): Promise<SessionRow> {
  if (session.status !== "ended" || session.mask_config) return session;
  return (await applyMaskSelection(session.id, DEFAULT_MASK_OPTIONS, true)).session;
}

// Sessions run on a timer but there is no background worker, so whoever looks at
// a session after its end time closes it.
export async function enforceTimer(session: SessionRow): Promise<SessionRow> {
  if (session.status === "live" && session.ends_at && Date.parse(session.ends_at) <= Date.now()) {
    return endSession(session, session.ends_at);
  }
  return session;
}
