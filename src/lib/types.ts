// Row shapes for the database tables (see supabase/migrations).
import type { RunConfig } from "./ai/prompts";
import type { MaskOptions } from "./masking";
import type { SessionStats } from "./analysis/session-stats";
import type { SimilarityMetrics } from "./text/metrics";

export interface GroupRow {
  id: string;
  code: string;
  name: string;
  notes: string | null;
  created_at: string;
}

export interface ParticipantRow {
  id: string;
  group_id: string;
  pseudonym: string;
  consent: Record<string, unknown>;
  consented_at: string;
  created_at: string;
}

export type SessionStatus = "scheduled" | "live" | "ended";

export interface MaskConfig extends MaskOptions {
  method: "random" | "manual";
  generatedAt: string;
  count: number;
  edited?: boolean;
  auto?: boolean; // picked automatically when the session ended
}

export interface SessionRow {
  id: string;
  group_id: string;
  session_number: number;
  title: string;
  topic: string;
  duration_seconds: number;
  status: SessionStatus;
  started_at: string | null;
  ends_at: string | null;
  ended_at: string | null;
  stats: SessionStats | null;
  stats_computed_at: string | null;
  mask_config: MaskConfig | null;
  created_at: string;
}

export interface MessageRow {
  id: number;
  session_id: string;
  participant_id: string | null;
  is_operator: boolean;
  author_label: string;
  body: string;
  client_id: string | null;
  created_at: string;
  is_masked: boolean;
  msg_type: string | null;
}

export interface RunRow {
  id: string;
  name: string;
  model: string;
  config: RunConfig;
  session_ids: string[];
  status: "pending" | "running" | "completed";
  total: number;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface PredictionRow {
  id: string;
  run_id: string;
  message_id: number;
  session_id: string;
  status: "pending" | "done" | "error";
  position_index: number;
  original_text: string;
  predicted_text: string | null;
  system_prompt: string | null;
  prompt: string | null;
  context_before: number | null;
  context_after: number | null;
  model: string | null;
  stop_reason: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  metrics: SimilarityMetrics | null;
  error: string | null;
  attempts: number;
  claimed_at: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ScoreRow {
  id: string;
  prediction_id: string;
  rater: string;
  rater_type: "human" | "llm";
  score: number;
  failure_tags: string[];
  msg_type: string | null;
  notes: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// What participants see for each message
export interface PublicMessage {
  id: number;
  author: string;
  body: string;
  at: string;
  mine: boolean;
  operator: boolean;
}
