// Withdrawal: the participant's conversations are deleted entirely (every
// session they posted in, including the other participants' messages and any
// predictions and scores), then the participant record itself.
import { HttpError } from "./http";
import { db } from "./supabase/admin";

export async function withdrawParticipant(participantId: string, initiatedBy: "participant" | "researcher") {
  const sb = db();
  const { data: participant, error } = await sb
    .from("participants")
    .select("id, group_id, group:study_groups(name)")
    .eq("id", participantId)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!participant) throw new HttpError(404, "Participant not found.");

  const { data: rows, error: msgError } = await sb
    .from("messages")
    .select("session_id")
    .eq("participant_id", participantId);
  if (msgError) throw new HttpError(500, msgError.message);
  const sessionIds = [...new Set((rows ?? []).map((r) => r.session_id as string))];

  let messagesDeleted = 0;
  if (sessionIds.length) {
    const { count } = await sb.from("messages").select("id", { count: "exact", head: true }).in("session_id", sessionIds);
    messagesDeleted = count ?? 0;
    const { error: delError } = await sb.from("sessions").delete().in("id", sessionIds);
    if (delError) throw new HttpError(500, delError.message);
  }
  const { error: pError } = await sb.from("participants").delete().eq("id", participantId);
  if (pError) throw new HttpError(500, pError.message);

  const groupName = (participant.group as unknown as { name: string } | null)?.name ?? null;
  await sb.from("withdrawal_log").insert({
    group_name: groupName,
    sessions_deleted: sessionIds.length,
    messages_deleted: messagesDeleted,
    initiated_by: initiatedBy,
  });
  return { sessionsDeleted: sessionIds.length, messagesDeleted };
}
