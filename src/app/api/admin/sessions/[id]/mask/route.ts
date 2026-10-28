import { z } from "zod";
import { requireResearcher } from "@/lib/auth";
import { HttpError, json, route } from "@/lib/http";
import { DEFAULT_MASK_OPTIONS } from "@/lib/masking";
import { applyMaskSelection, getSession } from "@/lib/sessions";
import { db } from "@/lib/supabase/admin";
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
  const { selection } = await applyMaskSelection(id, options);
  return json({ selection });
});

// Clear every gap. Recorded as an empty hand-picked selection so the automatic
// pick doesn't put them straight back.
export const DELETE = route(async (_req, ctx: RouteContext<"/api/admin/sessions/[id]/mask">) => {
  await requireResearcher();
  const { id } = await ctx.params;
  const sb = db();
  const { error } = await sb.from("messages").update({ is_masked: false }).eq("session_id", id).eq("is_masked", true);
  if (error) throw new HttpError(500, error.message);
  const cleared: MaskConfig = { ...DEFAULT_MASK_OPTIONS, method: "manual", generatedAt: new Date().toISOString(), count: 0 };
  await sb.from("sessions").update({ mask_config: cleared }).eq("id", id);
  return json({ ok: true });
});
