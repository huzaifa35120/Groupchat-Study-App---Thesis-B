// Response shapes shared by researcher pages.
import type { RunConfig } from "./ai/prompts";
import type { PredictionRow, ScoreRow } from "./types";

export type RunPrediction = PredictionRow & { sessionLabel: string; speaker: string; msgType: string | null; scores: ScoreRow[] };

export interface RunDetail {
  run: { id: string; name: string; model: string; status: string; config: RunConfig; created_by: string | null; created_at: string };
  me: string;
  progress: { pending: number; done: number; errors: number; total: number };
  predictions: RunPrediction[];
}
