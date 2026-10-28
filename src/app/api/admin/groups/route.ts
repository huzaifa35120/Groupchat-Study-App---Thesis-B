import { z } from "zod";
import { requireResearcher } from "@/lib/auth";
import { newGroupCode } from "@/lib/codes";
import { DEFAULT_SESSION_SECONDS, TOPIC_SUGGESTIONS } from "@/lib/constants";
import { HttpError, json, route } from "@/lib/http";
import { db } from "@/lib/supabase/admin";

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  notes: z.string().trim().max(2000).optional(),
  sessions: z.number().int().min(0).max(10).default(3),
  durationSeconds: z.number().int().min(60).max(7200).default(DEFAULT_SESSION_SECONDS),
});

export const POST = route(async (req) => {
  await requireResearcher();
  const body = Body.parse(await req.json());
  const sb = db();
  let group: { id: string; code: string } | null = null;
  for (let attempt = 0; attempt < 5 && !group; attempt++) {
    const { data, error } = await sb
      .from("study_groups")
      .insert({ name: body.name, notes: body.notes || null, code: newGroupCode() })
      .select("id, code")
      .single();
    if (error && error.code !== "23505") throw new HttpError(500, error.message);
    group = data;
  }
  if (!group) throw new HttpError(500, "Could not allocate a group code.");

  if (body.sessions > 0) {
    const rows = Array.from({ length: body.sessions }, (_, i) => ({
      group_id: group.id,
      session_number: i + 1,
      title: `Session ${i + 1}`,
      topic: TOPIC_SUGGESTIONS[i % TOPIC_SUGGESTIONS.length],
      duration_seconds: body.durationSeconds,
    }));
    const { error } = await sb.from("sessions").insert(rows);
    if (error) throw new HttpError(500, error.message);
  }
  return json({ group });
});
