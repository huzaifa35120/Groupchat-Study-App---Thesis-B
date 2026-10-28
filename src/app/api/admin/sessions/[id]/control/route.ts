import { z } from "zod";
import { requireResearcher } from "@/lib/auth";
import { HttpError, json, route } from "@/lib/http";
import { endSession, enforceTimer, getSession, recordSessionStats } from "@/lib/sessions";
import { db } from "@/lib/supabase/admin";
import type { SessionRow } from "@/lib/types";

const Body = z.object({
  action: z.enum(["start", "end", "extend", "reopen", "recompute"]),
  seconds: z.number().int().min(10).max(3600).optional(),
});

export const POST = route(async (req, ctx: RouteContext<"/api/admin/sessions/[id]/control">) => {
  await requireResearcher();
  const { id } = await ctx.params;
  const { action, seconds } = Body.parse(await req.json());
  const session = await enforceTimer(await getSession(id));
  const sb = db();
  const now = Date.now();

  const update = async (values: Partial<SessionRow>, expectStatus: SessionRow["status"]) => {
    const { data, error } = await sb.from("sessions").update(values).eq("id", id).eq("status", expectStatus).select("*").maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!data) throw new HttpError(409, "The session changed state; refresh and try again.");
    return data as SessionRow;
  };

  let result: SessionRow;
  switch (action) {
    case "start":
      if (session.status !== "scheduled") throw new HttpError(409, "Only a scheduled session can be started.");
      result = await update(
        {
          status: "live",
          started_at: new Date(now).toISOString(),
          ends_at: new Date(now + session.duration_seconds * 1000).toISOString(),
        },
        "scheduled",
      );
      break;
    case "end":
      if (session.status !== "live") throw new HttpError(409, "The session isn't live.");
      result = await endSession(session, new Date(now).toISOString());
      break;
    case "extend":
      if (session.status !== "live" || !session.ends_at) throw new HttpError(409, "The session isn't live.");
      result = await update({ ends_at: new Date(Date.parse(session.ends_at) + (seconds ?? 60) * 1000).toISOString() }, "live");
      break;
    case "reopen":
      if (session.status !== "ended") throw new HttpError(409, "Only an ended session can be reopened.");
      result = await update(
        { status: "live", ended_at: null, ends_at: new Date(now + (seconds ?? 120) * 1000).toISOString() },
        "ended",
      );
      break;
    case "recompute":
      result = await recordSessionStats(session);
      break;
  }
  return json({ session: result });
});
