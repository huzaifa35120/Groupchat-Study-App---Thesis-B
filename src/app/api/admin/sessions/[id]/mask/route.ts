import { z } from "zod";
import { requireResearcher } from "@/lib/auth";
import { HttpError, json, route } from "@/lib/http";
import { selectMasks } from "@/lib/masking";
import { getMessages, getSession } from "@/lib/sessions";
import { db } from "@/lib/supabase/admin";
import { lengthClass } from "@/lib/text/features";
import type { MaskConfig } from "@/lib/types";

const Body = z.object({
  ratio: z.number().min(0.01).max(0.5),
  seed: z.number().int().min(0).max(2 ** 31),
  skipFirst: z.number().int().min(0).max(20),
  protectLast: z.boolean(),
  noAdjacent: z.boolean(),
  stratify: z.boolean(),
});

// Pick the gaps for a finished session (seeded, reproducible).
export const POST = route(async (req, ctx: RouteContext<"/api/admin/sessions/[id]/mask">) => {
  await requireResearcher();
  const { id } = await ctx.params;
  const options = Body.parse(await req.json());
  const session = await getSession(id);
  if (session.status !== "ended") throw new HttpError(409, "Choose gaps after the session has ended.");
  const messages = await getMessages(id);
  const selection = selectMasks(
    messages.map((m) => ({ id: m.id, isOperator: m.is_operator, lengthClass: lengthClass(m.body) })),
    options,
  );
  const sb = db();
  const { error: clearError } = await sb.from("messages").update({ is_masked: false }).eq("session_id", id).eq("is_masked", true);
  if (clearError) throw new HttpError(500, clearError.message);
  if (selection.ids.length) {
    const { error } = await sb.from("messages").update({ is_masked: true }).in("id", selection.ids);
    if (error) throw new HttpError(500, error.message);
  }
  const maskConfig: MaskConfig = { ...options, method: "random", generatedAt: new Date().toISOString(), count: selection.ids.length };
  await sb.from("sessions").update({ mask_config: maskConfig }).eq("id", id);
  return json({ selection });
});

export const DELETE = route(async (_req, ctx: RouteContext<"/api/admin/sessions/[id]/mask">) => {
  await requireResearcher();
  const { id } = await ctx.params;
  const sb = db();
  const { error } = await sb.from("messages").update({ is_masked: false }).eq("session_id", id).eq("is_masked", true);
  if (error) throw new HttpError(500, error.message);
  await sb.from("sessions").update({ mask_config: null }).eq("id", id);
  return json({ ok: true });
});
