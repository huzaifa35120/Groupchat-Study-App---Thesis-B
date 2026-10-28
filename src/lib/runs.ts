// Shared helpers for prediction runs.
import { DEFAULT_RUN_CONFIG, type PromptMessage, type RunConfig } from "./ai/prompts";
import { HttpError } from "./http";
import { speakerLabels } from "./participants";
import { getMessages, getSession } from "./sessions";
import { db } from "./supabase/admin";
import type { PredictionRow, RunRow, SessionRow } from "./types";

export function withDefaults(config: Partial<RunConfig> | null | undefined): RunConfig {
  return { ...DEFAULT_RUN_CONFIG, ...(config ?? {}) };
}

export async function getRun(id: string): Promise<RunRow> {
  const { data, error } = await db().from("prediction_runs").select("*").eq("id", id).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "Run not found.");
  return { ...(data as RunRow), config: withDefaults((data as RunRow).config) };
}

export interface SessionContext {
  session: SessionRow;
  messages: PromptMessage[];
}

// Loads each session's transcript once per batch.
export function sessionContextLoader(config: RunConfig) {
  const cache = new Map<string, Promise<SessionContext>>();
  return (sessionId: string) => {
    if (!cache.has(sessionId)) {
      cache.set(
        sessionId,
        (async () => {
          const session = await getSession(sessionId);
          const [messages, labels] = await Promise.all([getMessages(sessionId), speakerLabels(session.group_id)]);
          return {
            session,
            messages: messages.map((m) => ({
              id: m.id,
              author:
                config.anonymiseSpeakers && m.participant_id
                  ? `Speaker ${(labels.get(m.participant_id) ?? "P?").slice(1)}`
                  : m.author_label,
              body: m.body,
              isOperator: m.is_operator,
              isMasked: m.is_masked,
              createdAt: m.created_at,
            })),
          };
        })(),
      );
    }
    return cache.get(sessionId)!;
  };
}

export async function runProgress(runId: string) {
  const sb = db();
  const counts = await Promise.all(
    (["pending", "done", "error"] as const).map(async (status) => {
      const { count, error } = await sb
        .from("predictions")
        .select("id", { count: "exact", head: true })
        .eq("run_id", runId)
        .eq("status", status);
      if (error) throw new HttpError(500, error.message);
      return count ?? 0;
    }),
  );
  const [pending, done, errors] = counts;
  return { pending, done, errors, total: pending + done + errors };
}

export async function updateRunStatus(runId: string) {
  const progress = await runProgress(runId);
  const status = progress.pending === 0 ? "completed" : "running";
  await db()
    .from("prediction_runs")
    .update({ status, completed_at: status === "completed" ? new Date().toISOString() : null })
    .eq("id", runId);
  return { ...progress, status };
}

export type { PredictionRow };
