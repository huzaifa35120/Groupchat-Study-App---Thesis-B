import { requireResearcher } from "@/lib/auth";
import { HttpError, json, route } from "@/lib/http";
import { enforceTimer } from "@/lib/sessions";
import { db } from "@/lib/supabase/admin";
import type { SessionRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireResearcher();
  const sb = db();
  const [groups, sessions, participants, runs] = await Promise.all([
    sb.from("study_groups").select("*").order("created_at"),
    sb.from("sessions").select("*").order("session_number"),
    sb.from("participants").select("id, group_id"),
    sb.from("prediction_runs").select("id, name, status, created_at").order("created_at", { ascending: false }),
  ]);
  for (const r of [groups, sessions, participants, runs]) if (r.error) throw new HttpError(500, r.error.message);
  const sessionRows = await Promise.all(((sessions.data ?? []) as SessionRow[]).map(enforceTimer));
  const { data: counts } = await sb.from("messages").select("session_id, is_operator, is_masked").limit(20000);

  return json({
    groups: (groups.data ?? []).map((g) => ({
      ...g,
      participants: (participants.data ?? []).filter((p) => p.group_id === g.id).length,
      sessions: sessionRows
        .filter((s) => s.group_id === g.id)
        .map((s) => ({
          id: s.id,
          number: s.session_number,
          title: s.title,
          status: s.status,
          endsAt: s.ends_at,
          messages: (counts ?? []).filter((m) => m.session_id === s.id && !m.is_operator).length,
          masked: (counts ?? []).filter((m) => m.session_id === s.id && m.is_masked).length,
          hasStats: Boolean(s.stats),
        })),
    })),
    runs: runs.data ?? [],
  });
});
