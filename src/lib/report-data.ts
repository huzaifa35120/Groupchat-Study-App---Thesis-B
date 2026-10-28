// Loads everything the results report needs.
import { buildReport, type PredictionLite, type ReportInput } from "./analysis/report";
import { fetchAll } from "./fetch-all";
import { withDefaults } from "./runs";
import { db } from "./supabase/admin";
import type { GroupRow, MessageRow, RunRow, ScoreRow, SessionRow } from "./types";

const PREDICTION_COLUMNS =
  "id, run_id, message_id, session_id, status, position_index, original_text, predicted_text, context_before, context_after, model, stop_reason, input_tokens, output_tokens, latency_ms, metrics, error, attempts, claimed_at, created_at, completed_at";

export async function loadReportInput(): Promise<ReportInput> {
  const sb = db();
  const [groups, participants, sessions, messages, runs, predictions, scores, withdrawals] = await Promise.all([
    fetchAll<GroupRow>(() => sb.from("study_groups").select("*").order("created_at")),
    fetchAll<{ id: string; group_id: string; created_at: string }>(() =>
      sb.from("participants").select("id, group_id, created_at").order("created_at"),
    ),
    fetchAll<SessionRow>(() => sb.from("sessions").select("*").order("created_at")),
    fetchAll<MessageRow>(() => sb.from("messages").select("*").order("id")),
    fetchAll<RunRow>(() => sb.from("prediction_runs").select("*").order("created_at")),
    fetchAll<PredictionLite>(() => sb.from("predictions").select(PREDICTION_COLUMNS).order("id")),
    fetchAll<ScoreRow>(() => sb.from("scores").select("*").order("id")),
    sb.from("withdrawal_log").select("id", { count: "exact", head: true }),
  ]);
  return {
    groups,
    participants,
    sessions,
    messages,
    runs: runs.map((r) => ({ ...r, config: withDefaults(r.config) })),
    predictions,
    scores,
    withdrawals: withdrawals.count ?? 0,
  };
}

export async function loadReport(runId: string | null, source: string | null) {
  return buildReport(await loadReportInput(), { runId, source });
}
