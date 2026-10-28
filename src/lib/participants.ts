// Participant identity: the access code shown once at sign-up, sent back in the
// x-access-code header. Only its hash is stored.
import { hashAccessCode } from "./codes";
import { HttpError } from "./http";
import { db } from "./supabase/admin";
import type { GroupRow, ParticipantRow } from "./types";

export async function participantFromCode(code: string | null): Promise<(ParticipantRow & { group: GroupRow }) | null> {
  if (!code) return null;
  const { data, error } = await db()
    .from("participants")
    .select("id, group_id, pseudonym, consent, consented_at, created_at, group:study_groups(*)")
    .eq("access_code_hash", hashAccessCode(code))
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  return (data as unknown as (ParticipantRow & { group: GroupRow }) | null) ?? null;
}

export async function requireParticipant(req: Request) {
  const participant = await participantFromCode(req.headers.get("x-access-code"));
  if (!participant) throw new HttpError(401, "Unknown access code. Re-open your study link and sign in again.");
  return participant;
}

// Anonymous speaker labels (P1, P2, ...) by join order within a group.
export async function speakerLabels(groupId: string): Promise<Map<string, string>> {
  const { data, error } = await db()
    .from("participants")
    .select("id, created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });
  if (error) throw new HttpError(500, error.message);
  return new Map((data ?? []).map((p, i) => [p.id as string, `P${i + 1}`]));
}
