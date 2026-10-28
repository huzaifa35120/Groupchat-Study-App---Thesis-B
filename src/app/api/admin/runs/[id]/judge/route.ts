import { z } from "zod";
import { describeError, judgePrediction } from "@/lib/ai/claude";
import { buildJudgePrompt, buildPredictionPrompt } from "@/lib/ai/prompts";
import { requireResearcher } from "@/lib/auth";
import { DEFAULT_MODEL, EFFORT_LEVELS } from "@/lib/constants";
import { fetchAll } from "@/lib/fetch-all";
import { HttpError, json, route } from "@/lib/http";
import { getRun, sessionContextLoader } from "@/lib/runs";
import { db } from "@/lib/supabase/admin";
import type { PredictionRow } from "@/lib/types";

export const maxDuration = 300;

const Body = z.object({
  batch: z.number().int().min(1).max(8).default(3),
  model: z.string().default(DEFAULT_MODEL),
  effort: z.enum(EFFORT_LEVELS).default("high"),
  redo: z.boolean().default(false),
});

// LLM judge: applies the same 0-3 rubric as a secondary rater.
export const POST = route(async (req, ctx: RouteContext<"/api/admin/runs/[id]/judge">) => {
  await requireResearcher();
  const { id } = await ctx.params;
  const body = Body.parse(await req.json().catch(() => ({})));
  const rater = `llm:${body.model}`;
  const run = await getRun(id);
  const sb = db();

  const done = await fetchAll<PredictionRow>(() =>
    sb.from("predictions").select("*").eq("run_id", id).eq("status", "done").order("session_id").order("position_index"),
  );
  const existing = await fetchAll<{ id: string; prediction_id: string }>(() =>
    sb.from("scores").select("id, prediction_id, predictions!inner(run_id)").eq("predictions.run_id", id).eq("rater", rater).order("id"),
  );
  if (body.redo && existing.length) {
    for (let i = 0; i < existing.length; i += 100) {
      const { error } = await sb.from("scores").delete().in("id", existing.slice(i, i + 100).map((s) => s.id));
      if (error) throw new HttpError(500, error.message);
    }
  }
  const judged = new Set(body.redo ? [] : existing.map((s) => s.prediction_id));
  const todo = done.filter((p) => !judged.has(p.id));
  const slice = todo.slice(0, body.batch);
  const judgeContext = {
    ...run.config,
    contextMode: "bidirectional" as const,
    windowBefore: null,
    windowAfter: null,
    otherGaps: "visible" as const,
    revealSpeaker: true,
    includeOperator: true,
    includeTopic: true,
  };
  const load = sessionContextLoader(judgeContext);

  const results = await Promise.all(
    slice.map(async (p) => {
      try {
        const { session, messages } = await load(p.session_id);
        const transcript = buildPredictionPrompt({
          topic: session.topic,
          messages,
          targetId: p.message_id,
          config: judgeContext,
          instruction: false,
        });
        const res = await judgePrediction({
          model: body.model,
          effort: body.effort,
          user: buildJudgePrompt({ transcriptPrompt: transcript.user, original: p.original_text, candidate: p.predicted_text ?? "" }),
        });
        const o = res.output;
        const { error } = await sb.from("scores").upsert(
          {
            prediction_id: p.id,
            rater,
            rater_type: "llm",
            score: o.score,
            failure_tags: o.failure_tags,
            msg_type: o.original_type,
            notes: o.rationale,
            details: {
              same_meaning: o.same_meaning,
              similar_style: o.similar_style,
              fits_context: o.fits_context,
              model: res.model,
              effort: body.effort,
              input_tokens: res.inputTokens,
              output_tokens: res.outputTokens,
              latency_ms: res.latencyMs,
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "prediction_id,rater" },
        );
        if (error) throw new Error(error.message);
        return { id: p.id, ok: true };
      } catch (err) {
        return { id: p.id, ok: false, error: describeError(err) };
      }
    }),
  );
  const failed = results.filter((r) => !r.ok).length;
  return json({ processed: results, remaining: todo.length - slice.length + failed, total: done.length });
});
