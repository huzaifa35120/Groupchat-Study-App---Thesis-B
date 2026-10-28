import { predictGap } from "@/lib/ai/claude";
import { buildPredictionPrompt, DEFAULT_RUN_CONFIG } from "@/lib/ai/prompts";
import { requireResearcher } from "@/lib/auth";
import { DEFAULT_MODEL } from "@/lib/constants";
import { json, route } from "@/lib/http";

export const maxDuration = 120;

const SAMPLE = ["anyone been to the new ramen place near central", "nah is it good", "GAP", "ok we're going friday then", "im in"];

// One real prediction on a made-up transcript, through the same code path as a run.
export const POST = route(async () => {
  await requireResearcher();
  const authors = ["Kiwi", "Mango", "Kiwi", "Pineapple", "Mango"];
  const t0 = Date.now();
  const messages = SAMPLE.map((body, i) => ({
    id: i + 1,
    author: authors[i],
    body: body === "GAP" ? "(hidden)" : body,
    isOperator: false,
    isMasked: body === "GAP",
    createdAt: new Date(t0 + i * 15000).toISOString(),
  }));
  const config = { ...DEFAULT_RUN_CONFIG, effort: "low" as const };
  const built = buildPredictionPrompt({ topic: "Food around campus", messages, targetId: 3, config });
  const res = await predictGap({ model: DEFAULT_MODEL, effort: config.effort, system: config.systemPrompt, user: built.user });
  return json({ output: res.output, model: res.model, inputTokens: res.inputTokens, outputTokens: res.outputTokens, latencyMs: res.latencyMs });
});
