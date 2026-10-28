// Session lifecycle: lazy timer enforcement, ending, and recording statistics.
import { computeSessionStats } from "./analysis/session-stats";
import { HttpError } from "./http";
import { speakerLabels } from "./participants";
import { db } from "./supabase/admin";
import type { MessageRow, SessionRow } from "./types";

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
  return recordSessionStats(data as SessionRow);
}

// Sessions run on a timer but there is no background worker, so whoever looks at
// a session after its end time closes it.
export async function enforceTimer(session: SessionRow): Promise<SessionRow> {
  if (session.status === "live" && session.ends_at && Date.parse(session.ends_at) <= Date.now()) {
    return endSession(session, session.ends_at);
  }
  return session;
}
