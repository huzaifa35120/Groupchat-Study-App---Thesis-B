// Calls to Claude for gap prediction and rubric judging. Only message text and
// made-up names are sent; nothing that identifies a participant.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { FAILURE_TAG_IDS, MSG_TYPE_IDS, type Effort } from "../constants";
import { JUDGE_SYSTEM_PROMPT, rubricScore } from "./prompts";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set on the server.");
  client ??= new Anthropic({ timeout: 180_000, maxRetries: 3 });
  return client;
}

export class ModelRefusal extends Error {}

const PredictionSchema = z.object({ message: z.string() });

export interface CallResult<T> {
  output: T;
  model: string;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export async function predictGap(args: {
  model: string;
  effort: Effort;
  system: string;
  user: string;
}): Promise<CallResult<string>> {
  const started = Date.now();
  const res = await anthropic().messages.parse({
    model: args.model,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: args.effort, format: zodOutputFormat(PredictionSchema) },
    system: args.system,
    messages: [{ role: "user", content: args.user }],
  });
  if (res.stop_reason === "refusal") {
    throw new ModelRefusal(`Model declined (${res.stop_details?.category ?? "no category"})`);
  }
  if (!res.parsed_output) throw new Error(`No parseable output (stop_reason: ${res.stop_reason})`);
  return {
    output: res.parsed_output.message.trim(),
    model: res.model,
    stopReason: res.stop_reason,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    latencyMs: Date.now() - started,
  };
}

const JudgeSchema = z.object({
  same_meaning: z.boolean(),
  similar_style: z.boolean(),
  fits_context: z.boolean(),
  failure_tags: z.array(z.enum(FAILURE_TAG_IDS)),
  original_type: z.enum(MSG_TYPE_IDS),
  rationale: z.string(),
});
export type JudgeOutput = z.infer<typeof JudgeSchema> & { score: number };

export async function judgePrediction(args: {
  model: string;
  effort: Effort;
  user: string;
}): Promise<CallResult<JudgeOutput>> {
  const started = Date.now();
  const res = await anthropic().messages.parse({
    model: args.model,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: args.effort, format: zodOutputFormat(JudgeSchema) },
    system: JUDGE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: args.user }],
  });
  if (res.stop_reason === "refusal") {
    throw new ModelRefusal(`Model declined (${res.stop_details?.category ?? "no category"})`);
  }
  if (!res.parsed_output) throw new Error(`No parseable output (stop_reason: ${res.stop_reason})`);
  const output = res.parsed_output;
  return {
    output: { ...output, failure_tags: [...new Set(output.failure_tags)], score: rubricScore(output) },
    model: res.model,
    stopReason: res.stop_reason,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    latencyMs: Date.now() - started,
  };
}

export function describeError(err: unknown): string {
  if (err instanceof ModelRefusal) return err.message;
  if (err instanceof Anthropic.AuthenticationError) return "Anthropic API key was rejected.";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the Anthropic API; try again shortly.";
  if (err instanceof Anthropic.BadRequestError) return `Bad request: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `Anthropic API error ${err.status ?? ""}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

// Setup check: confirms the key is valid and the model is available (free call).
export async function checkModelAccess(model: string): Promise<string> {
  const info = await anthropic().models.retrieve(model);
  return info.id;
}
