import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { describeError, ModelRefusal, predictGap } from "@/lib/ai/claude";
import { buildPredictionPrompt } from "@/lib/ai/prompts";
import { requireResearcher } from "@/lib/auth";
import { HttpError, json, route } from "@/lib/http";
import { getRun, sessionContextLoader, updateRunStatus } from "@/lib/runs";
import { db } from "@/lib/supabase/admin";
import { computeSimilarity } from "@/lib/text/metrics";
import type { PredictionRow } from "@/lib/types";

export const maxDuration = 300;

const Body = z.object({ batch: z.number().int().min(1).max(8).default(3) });
const MAX_ATTEMPTS = 4;

function retryable(err: unknown) {
  if (err instanceof ModelRefusal) return false;
  if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.APIConnectionError) return true;
  if (err instanceof Anthropic.APIError) return (err.status ?? 500) >= 500;
  return false;
}

// Processes the next few gaps. The page calls this repeatedly until nothing is
// pending, so a run survives closed tabs and serverless time limits.
export const POST = route(async (req, ctx: RouteContext<"/api/admin/runs/[id]/step">) => {
  await requireResearcher();
  const { id } = await ctx.params;
  const { batch } = Body.parse(await req.json().catch(() => ({})));
  const run = await getRun(id);
  const sb = db();
  const { data: claimed, error } = await sb.rpc("claim_predictions", { p_run: id, p_limit: batch });
  if (error) throw new HttpError(500, error.message);
  const load = sessionContextLoader(run.config);

  const results = await Promise.all(
    ((claimed ?? []) as PredictionRow[]).map(async (p) => {
      try {
        const { session, messages } = await load(p.session_id);
        const built = buildPredictionPrompt({ topic: session.topic, messages, targetId: p.message_id, config: run.config });
        const res = await predictGap({ model: run.model, effort: run.config.effort, system: run.config.systemPrompt, user: built.user });
        const { error: upError } = await sb
          .from("predictions")
          .update({
            status: "done",
            predicted_text: res.output,
            system_prompt: run.config.systemPrompt,
            prompt: built.user,
            context_before: built.contextBefore,
            context_after: built.contextAfter,
            model: res.model,
            stop_reason: res.stopReason,
            input_tokens: res.inputTokens,
            output_tokens: res.outputTokens,
            latency_ms: res.latencyMs,
            metrics: computeSimilarity(p.original_text, res.output),
            error: null,
            completed_at: new Date().toISOString(),
          })
          .eq("id", p.id);
        if (upError) throw new Error(upError.message);
        return { id: p.id, ok: true };
      } catch (err) {
        const message = describeError(err);
        const giveUp = !retryable(err) || p.attempts >= MAX_ATTEMPTS;
        await sb
          .from("predictions")
          .update(giveUp ? { status: "error", error: message } : { claimed_at: null, error: message })
          .eq("id", p.id);
        return { id: p.id, ok: false, error: message };
      }
    }),
  );

  const progress = await updateRunStatus(id);
  return json({ processed: results, progress });
});
