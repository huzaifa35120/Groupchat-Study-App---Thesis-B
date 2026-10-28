import { z } from "zod";
import { DEFAULT_RUN_CONFIG } from "@/lib/ai/prompts";
import { requireResearcher } from "@/lib/auth";
import { DEFAULT_MODEL, EFFORT_LEVELS } from "@/lib/constants";
import { fetchAll } from "@/lib/fetch-all";
import { HttpError, json, route } from "@/lib/http";
import { db } from "@/lib/supabase/admin";
import type { MessageRow, PredictionRow, RunRow, SessionRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireResearcher();
  const sb = db();
  const { data: runs, error } = await sb.from("prediction_runs").select("*").order("created_at", { ascending: false });
  if (error) throw new HttpError(500, error.message);
  const preds = await fetchAll<Pick<PredictionRow, "run_id" | "status" | "id">>(() =>
    sb.from("predictions").select("id, run_id, status").order("id"),
  );
  const scores = await fetchAll<{ prediction_id: string; rater_type: string }>(() =>
    sb.from("scores").select("prediction_id, rater_type").order("id"),
  );
  const predRun = new Map(preds.map((p) => [p.id, p.run_id]));
  return json({
    runs: ((runs ?? []) as RunRow[]).map((r) => {
      const mine = preds.filter((p) => p.run_id === r.id);
      const runScores = scores.filter((s) => predRun.get(s.prediction_id) === r.id);
      return {
        ...r,
        done: mine.filter((p) => p.status === "done").length,
        errors: mine.filter((p) => p.status === "error").length,
        pending: mine.filter((p) => p.status === "pending").length,
        humanScored: new Set(runScores.filter((s) => s.rater_type === "human").map((s) => s.prediction_id)).size,
        llmScored: new Set(runScores.filter((s) => s.rater_type === "llm").map((s) => s.prediction_id)).size,
      };
    }),
  });
});

const Config = z.object({
  effort: z.enum(EFFORT_LEVELS),
  contextMode: z.enum(["bidirectional", "preceding"]),
  windowBefore: z.number().int().min(1).max(500).nullable(),
  windowAfter: z.number().int().min(1).max(500).nullable(),
  otherGaps: z.enum(["visible", "hidden"]),
  revealSpeaker: z.boolean(),
  includeOperator: z.boolean(),
  includeTopic: z.boolean(),
  includeTimestamps: z.boolean(),
  anonymiseSpeakers: z.boolean(),
  systemPrompt: z.string().trim().min(20).max(8000),
  promptVersion: z.string().trim().min(1).max(40),
});

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  model: z.string().trim().min(3).max(80).default(DEFAULT_MODEL),
  sessionIds: z.array(z.string().uuid()).min(1),
  config: Config.partial().default({}),
});

// Creates a run: one pending prediction for every masked message in the chosen sessions.
export const POST = route(async (req) => {
  const researcher = await requireResearcher();
  const body = Body.parse(await req.json());
  const config = { ...DEFAULT_RUN_CONFIG, ...body.config };
  const sb = db();

  const { data: sessions, error } = await sb.from("sessions").select("*").in("id", body.sessionIds);
  if (error) throw new HttpError(500, error.message);
  const notEnded = ((sessions ?? []) as SessionRow[]).filter((s) => s.status !== "ended");
  if (notEnded.length) throw new HttpError(409, "Every selected session must have ended.");

  const messages = await fetchAll<MessageRow>(() =>
    sb.from("messages").select("*").in("session_id", body.sessionIds).order("id"),
  );
  const rows: Omit<PredictionRow, "id" | "created_at" | "attempts" | "claimed_at" | "completed_at" | "predicted_text" | "system_prompt" | "prompt" | "context_before" | "context_after" | "model" | "stop_reason" | "input_tokens" | "output_tokens" | "latency_ms" | "metrics" | "error" | "run_id" | "status">[] = [];
  for (const sessionId of body.sessionIds) {
    const seq = messages.filter((m) => m.session_id === sessionId && !m.is_operator);
    seq.forEach((m, index) => {
      if (m.is_masked) rows.push({ message_id: m.id, session_id: sessionId, position_index: index, original_text: m.body });
    });
  }
  if (!rows.length) throw new HttpError(409, "The selected sessions have no gaps yet. Choose gaps on each session page first.");

  const { data: run, error: runError } = await sb
    .from("prediction_runs")
    .insert({ name: body.name, model: body.model, config, session_ids: body.sessionIds, total: rows.length, created_by: researcher.email })
    .select("*")
    .single();
  if (runError) throw new HttpError(500, runError.message);
  const { error: predError } = await sb.from("predictions").insert(rows.map((r) => ({ ...r, run_id: run.id })));
  if (predError) {
    await sb.from("prediction_runs").delete().eq("id", run.id);
    throw new HttpError(500, predError.message);
  }
  return json({ run });
});
