import { normaliseCode } from "@/lib/codes";
import { HttpError, json, route } from "@/lib/http";
import { participantFromCode } from "@/lib/participants";
import { enforceTimer } from "@/lib/sessions";
import { db } from "@/lib/supabase/admin";
import type { SessionRow } from "@/lib/types";

export const dynamic = "force-dynamic";

// Lobby: the group's sessions and whether this browser is already signed in.
export const GET = route(async (req, ctx: RouteContext<"/api/p/groups/[code]">) => {
  const { code } = await ctx.params;
  const { data: group, error } = await db()
    .from("study_groups")
    .select("id, code, name")
    .eq("code", normaliseCode(code))
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!group) throw new HttpError(404, "This study link isn't valid. Check the link in your email.");

  const { data: sessionRows, error: sError } = await db()
    .from("sessions")
    .select("*")
    .eq("group_id", group.id)
    .order("session_number");
  if (sError) throw new HttpError(500, sError.message);
  const sessions = await Promise.all(((sessionRows ?? []) as SessionRow[]).map(enforceTimer));

  const me = await participantFromCode(req.headers.get("x-access-code"));
  return json({
    group: { code: group.code, name: group.name },
    me: me && me.group_id === group.id ? { pseudonym: me.pseudonym } : null,
    sessions: sessions.map((s) => ({
      id: s.id,
      number: s.session_number,
      title: s.title,
      status: s.status,
      endsAt: s.ends_at,
    })),
    serverNow: new Date().toISOString(),
  });
});
