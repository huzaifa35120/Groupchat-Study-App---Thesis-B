import { z } from "zod";
import { requireResearcher } from "@/lib/auth";
import { DEFAULT_SESSION_SECONDS } from "@/lib/constants";
import { HttpError, json, route } from "@/lib/http";
import { db } from "@/lib/supabase/admin";

const Body = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  topic: z.string().trim().min(1).max(500),
  durationSeconds: z.number().int().min(60).max(7200).default(DEFAULT_SESSION_SECONDS),
});

export const POST = route(async (req, ctx: RouteContext<"/api/admin/groups/[id]/sessions">) => {
  await requireResearcher();
  const { id } = await ctx.params;
  const body = Body.parse(await req.json());
  const sb = db();
  const { data: last } = await sb
    .from("sessions")
    .select("session_number")
    .eq("group_id", id)
    .order("session_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const number = (last?.session_number ?? 0) + 1;
  const { data, error } = await sb
    .from("sessions")
    .insert({
      group_id: id,
      session_number: number,
      title: body.title ?? `Session ${number}`,
      topic: body.topic,
      duration_seconds: body.durationSeconds,
    })
    .select("*")
    .single();
  if (error) throw new HttpError(500, error.message);
  return json({ session: data });
});
