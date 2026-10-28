import { z } from "zod";
import { requireResearcher } from "@/lib/auth";
import { FAILURE_TAG_IDS, MSG_TYPE_IDS } from "@/lib/constants";
import { HttpError, json, route } from "@/lib/http";
import { db } from "@/lib/supabase/admin";

const Body = z.object({
  predictionId: z.string().uuid(),
  score: z.number().int().min(0).max(3),
  failureTags: z.array(z.enum(FAILURE_TAG_IDS)).default([]),
  msgType: z.enum(MSG_TYPE_IDS).nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
});

// Human rubric score from the signed-in researcher (one per rater per gap).
export const POST = route(async (req) => {
  const researcher = await requireResearcher();
  const body = Body.parse(await req.json());
  const sb = db();
  const { data: prediction, error } = await sb.from("predictions").select("id, message_id").eq("id", body.predictionId).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!prediction) throw new HttpError(404, "Prediction not found.");

  const { data, error: upError } = await sb
    .from("scores")
    .upsert(
      {
        prediction_id: body.predictionId,
        rater: researcher.email,
        rater_type: "human",
        score: body.score,
        failure_tags: [...new Set(body.failureTags)],
        msg_type: body.msgType ?? null,
        notes: body.notes || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "prediction_id,rater" },
    )
    .select("*")
    .single();
  if (upError) throw new HttpError(500, upError.message);
  // The researcher's message-type label is canonical for the message across runs.
  if (body.msgType !== undefined) await sb.from("messages").update({ msg_type: body.msgType }).eq("id", prediction.message_id);
  return json({ score: data });
});

export const DELETE = route(async (req) => {
  const researcher = await requireResearcher();
  const predictionId = new URL(req.url).searchParams.get("predictionId");
  if (!predictionId) throw new HttpError(400, "predictionId is required.");
  const { error } = await db().from("scores").delete().eq("prediction_id", predictionId).eq("rater", researcher.email);
  if (error) throw new HttpError(500, error.message);
  return json({ ok: true });
});
