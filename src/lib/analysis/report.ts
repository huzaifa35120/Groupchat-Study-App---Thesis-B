// Builds the full results report: session records, masking, and the evaluation
// of one prediction run under one score source. Pure function of the data so
// the page, the Markdown export and the CSV export all agree.

import { AI_CUES, FAILURE_TAGS, MSG_TYPES, RUBRIC, tagLabel, typeLabel } from "../constants";
import { num, pct, pText } from "../format";
import { BINARY_FEATURES, messageFeatures, type LengthClass, type MessageFeatures } from "../text/features";
import { METRIC_INFO, type SimilarityMetrics } from "../text/metrics";
import type { GroupRow, MessageRow, PredictionRow, RunRow, ScoreRow, SessionRow } from "../types";
import type { SessionStats } from "./session-stats";
import * as S from "./stats";

export type PredictionLite = Omit<PredictionRow, "prompt" | "system_prompt">;

export interface ReportInput {
  groups: GroupRow[];
  participants: { id: string; group_id: string; created_at: string }[];
  sessions: SessionRow[];
  messages: MessageRow[];
  runs: RunRow[];
  predictions: PredictionLite[];
  scores: ScoreRow[];
  withdrawals: number;
}

export interface GapRow {
  predictionId: string;
  messageId: number;
  sessionId: string;
  sessionLabel: string;
  speaker: string;
  position: number;
  relPosition: number;
  lengthClass: LengthClass;
  msgType: string | null;
  original: string;
  predicted: string;
  metrics: SimilarityMetrics;
  origFeatures: MessageFeatures;
  predFeatures: MessageFeatures;
  score: number | null;
  scoreRounded: number | null;
  tags: string[];
  notes: string | null;
  raterScores: Record<string, number>;
  contextBefore: number | null;
  contextAfter: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
}

export interface GroupStat {
  key: string;
  label: string;
  n: number;
  mean: number | null;
  sd: number | null;
  median: number | null;
  dist: number[]; // counts for scores 0..3
}

export interface SessionSummary {
  id: string;
  label: string;
  groupName: string;
  number: number;
  title: string;
  topic: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  participantMessages: number;
  operatorMessages: number;
  masked: number;
  stats: SessionStats | null;
}

export interface RunSummary {
  id: string;
  name: string;
  model: string;
  status: string;
  createdAt: string;
  config: RunRow["config"];
  sessions: string[];
  total: number;
  done: number;
  errors: number;
  pending: number;
  humanScored: number;
  llmScored: number;
}

export interface ScoreSource {
  key: string;
  label: string;
  count: number;
}

export interface Evaluation {
  run: RunSummary;
  source: ScoreSource;
  nPredictions: number;
  n: number;
  summary: S.Summary;
  ci95: [number, number] | null;
  distribution: { score: number; label: string; count: number; share: number }[];
  shareAtLeast2: number | null;
  bySession: GroupStat[];
  sessionTest: S.TestResult & { df: number };
  byLength: GroupStat[];
  lengthTest: S.TestResult;
  byType: GroupStat[];
  typeTest: S.TestResult & { df: number };
  byThird: GroupStat[];
  positionCorr: S.Correlation;
  contextCorr: S.Correlation;
  failures: {
    n: number;
    share: number | null;
    tags: { id: string; label: string; cue: string | null; count: number; shareOfFailures: number | null; allCount: number }[];
    byLength: { id: string; label: string; short: number; longer: number }[];
    untagged: number;
  };
  cues: { id: string; label: string; description: string; tags: string[]; count: number; share: number | null }[];
  metrics: { key: string; label: string; description: string; summary: S.Summary; corr: S.Correlation }[];
  metricsByScore: { score: number; n: number; values: Record<string, number | null> }[];
  length: {
    orig: S.Summary;
    pred: S.Summary;
    test: S.TestResult;
    dz: number | null;
    ratioMedian: number | null;
    shareLonger: number | null;
    shareShorter: number | null;
    shareSame: number | null;
    cvOrig: number | null;
    cvPred: number | null;
    shortOrigShareLongerPred: number | null;
  };
  style: { key: string; label: string; original: number | null; ai: number | null; baseline: number | null; diff: number | null; p: number | null }[];
  agreement: ({ a: string; b: string } & S.Agreement)[];
  usage: { inputTokens: number; outputTokens: number; meanLatencyMs: number | null; costUsd: number | null };
  gaps: GapRow[];
}

export interface RunComparison {
  runId: string;
  name: string;
  configDiff: string[];
  nPaired: number;
  scoreSource: string | null;
  scoreA: number | null;
  scoreB: number | null;
  scoreTest: S.TestResult | null;
  metrics: { key: string; label: string; meanA: number | null; meanB: number | null; test: S.TestResult }[];
}

export interface ResultsReport {
  generatedAt: string;
  overview: {
    groups: number;
    participants: number;
    sessions: number;
    sessionsEnded: number;
    participantMessages: number;
    operatorMessages: number;
    masked: number;
    runs: number;
    withdrawals: number;
  };
  sessions: SessionSummary[];
  sessionAggregate: { key: string; label: string; summary: S.Summary; digits: number; percent?: boolean }[];
  masking: { sessionLabel: string; participantMessages: number; masked: number; ratio: number | null; short: number; longer: number; seed: number | null; method: string }[];
  runs: RunSummary[];
  selectedRunId: string | null;
  sources: ScoreSource[];
  evaluation: Evaluation | null;
  comparisons: RunComparison[];
  methodsText: string;
  resultsText: string;
}

const PRICES: Record<string, [number, number]> = {
  "claude-opus-5": [5, 25],
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5": [2, 10],
  "claude-fable-5-1": [10, 50],
  "claude-haiku-4-5": [1, 5],
};

function sessionLabel(groups: Map<string, GroupRow>, s: SessionRow) {
  return `${groups.get(s.group_id)?.name ?? "Group"} · S${s.session_number}`;
}

function groupStat(key: string, label: string, scores: number[]): GroupStat {
  const dist = [0, 0, 0, 0];
  for (const s of scores) dist[Math.max(0, Math.min(3, Math.round(s)))]++;
  return { key, label, n: scores.length, mean: S.mean(scores), sd: S.sd(scores), median: S.median(scores), dist };
}

function share(flags: boolean[]): number | null {
  return flags.length ? flags.filter(Boolean).length / flags.length : null;
}

export function listSources(scores: ScoreRow[]): ScoreSource[] {
  const counts = new Map<string, { type: string; count: number }>();
  for (const s of scores) {
    const entry = counts.get(s.rater) ?? { type: s.rater_type, count: 0 };
    entry.count++;
    counts.set(s.rater, entry);
  }
  const sources: ScoreSource[] = [...counts.entries()]
    .sort((a, b) => (a[1].type === b[1].type ? b[1].count - a[1].count : a[1].type === "human" ? -1 : 1))
    .map(([rater, e]) => ({
      key: `rater:${rater}`,
      label: e.type === "llm" ? `LLM judge (${rater.replace(/^llm:/, "")})` : `Human: ${rater}`,
      count: e.count,
    }));
  const humans = [...counts.values()].filter((e) => e.type === "human").length;
  if (humans >= 2) {
    const predsWithHuman = new Set(scores.filter((s) => s.rater_type === "human").map((s) => s.prediction_id));
    sources.splice(humans, 0, { key: "human-mean", label: "Mean of human raters", count: predsWithHuman.size });
  }
  return sources;
}

function scoreFor(
  sourceKey: string,
  predScores: ScoreRow[],
): { score: number | null; tags: string[]; msgType: string | null; notes: string | null } {
  if (sourceKey === "human-mean") {
    const humans = predScores.filter((s) => s.rater_type === "human");
    if (!humans.length) return { score: null, tags: [], msgType: null, notes: null };
    return {
      score: S.mean(humans.map((s) => s.score)),
      tags: [...new Set(humans.flatMap((s) => s.failure_tags))],
      msgType: humans.find((s) => s.msg_type)?.msg_type ?? null,
      notes: humans.map((s) => s.notes).filter(Boolean).join(" | ") || null,
    };
  }
  const rater = sourceKey.replace(/^rater:/, "");
  const row = predScores.find((s) => s.rater === rater);
  if (!row) return { score: null, tags: [], msgType: null, notes: null };
  return { score: row.score, tags: row.failure_tags, msgType: row.msg_type, notes: row.notes };
}

function summariseRun(run: RunRow, preds: PredictionLite[], scores: ScoreRow[], labels: Map<string, string>): RunSummary {
  const ids = new Set(preds.map((p) => p.id));
  const runScores = scores.filter((s) => ids.has(s.prediction_id));
  return {
    id: run.id,
    name: run.name,
    model: run.model,
    status: run.status,
    createdAt: run.created_at,
    config: run.config,
    sessions: run.session_ids.map((id) => labels.get(id) ?? id),
    total: preds.length,
    done: preds.filter((p) => p.status === "done").length,
    errors: preds.filter((p) => p.status === "error").length,
    pending: preds.filter((p) => p.status === "pending").length,
    humanScored: new Set(runScores.filter((s) => s.rater_type === "human").map((s) => s.prediction_id)).size,
    llmScored: new Set(runScores.filter((s) => s.rater_type === "llm").map((s) => s.prediction_id)).size,
  };
}

function configDiff(a: RunRow["config"], b: RunRow["config"]): string[] {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]) as Set<keyof RunRow["config"]>;
  const out: string[] = [];
  for (const key of keys) {
    if (key === "systemPrompt") {
      if (a[key] !== b[key]) out.push("system prompt differs");
      continue;
    }
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
      out.push(`${key}: ${JSON.stringify(a[key])} → ${JSON.stringify(b[key])}`);
    }
  }
  return out;
}

export function buildReport(input: ReportInput, options: { runId?: string | null; source?: string | null }): ResultsReport {
  const groups = new Map(input.groups.map((g) => [g.id, g]));
  const sessions = [...input.sessions].sort((a, b) => {
    const ga = groups.get(a.group_id)?.created_at ?? "";
    const gb = groups.get(b.group_id)?.created_at ?? "";
    return ga === gb ? a.session_number - b.session_number : ga.localeCompare(gb);
  });
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));
  const labels = new Map(sessions.map((s) => [s.id, sessionLabel(groups, s)]));

  // Speaker labels per group in join order
  const speaker = new Map<string, string>();
  const byGroup = new Map<string, { id: string; created_at: string }[]>();
  for (const p of input.participants) byGroup.set(p.group_id, [...(byGroup.get(p.group_id) ?? []), p]);
  for (const list of byGroup.values()) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach((p, i) => speaker.set(p.id, `P${i + 1}`));
  }

  // Participant-only sequence per session
  const seqBySession = new Map<string, MessageRow[]>();
  for (const m of [...input.messages].sort((a, b) => a.id - b.id)) {
    if (m.is_operator) continue;
    seqBySession.set(m.session_id, [...(seqBySession.get(m.session_id) ?? []), m]);
  }
  const positionOf = new Map<number, { index: number; total: number }>();
  for (const seq of seqBySession.values()) seq.forEach((m, i) => positionOf.set(m.id, { index: i, total: seq.length }));
  const messageById = new Map(input.messages.map((m) => [m.id, m]));

  // ---- Sessions -----------------------------------------------------------
  const sessionSummaries: SessionSummary[] = sessions.map((s) => {
    const msgs = input.messages.filter((m) => m.session_id === s.id);
    return {
      id: s.id,
      label: labels.get(s.id)!,
      groupName: groups.get(s.group_id)?.name ?? "",
      number: s.session_number,
      title: s.title,
      topic: s.topic,
      status: s.status,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      participantMessages: msgs.filter((m) => !m.is_operator).length,
      operatorMessages: msgs.filter((m) => m.is_operator).length,
      masked: msgs.filter((m) => m.is_masked).length,
      stats: s.stats,
    };
  });

  const withStats = sessions.filter((s) => s.stats);
  const agg = (key: string, label: string, get: (st: SessionStats) => number | null, digits = 1, percent = false) => ({
    key,
    label,
    digits,
    percent,
    summary: S.summarise(withStats.map((s) => get(s.stats!)).filter((v): v is number => v !== null)),
  });
  const sessionAggregate = [
    agg("messages", "Participant messages", (st) => st.messages, 1),
    agg("duration", "Duration (min)", (st) => (st.actualDurationSec === null ? null : st.actualDurationSec / 60), 1),
    agg("mpm", "Messages per minute", (st) => st.messagesPerMinute, 2),
    agg("words", "Words per message", (st) => st.wordsPerMessage.mean, 2),
    agg("short", "Short messages (≤3 words)", (st) => st.shares.short, 1, true),
    agg("question", "Questions", (st) => st.shares.question, 1, true),
    agg("emoji", "Messages with emoji", (st) => st.shares.emoji, 1, true),
    agg("laughter", "Laughter tokens", (st) => st.shares.laughter, 1, true),
    agg("lower", "Starts lowercase", (st) => st.shares.startsLowercase, 1, true),
    agg("ttr", "Type-token ratio", (st) => st.typeTokenRatio, 3),
    agg("switch", "Speaker switch rate", (st) => st.speakerSwitchRate, 3),
    agg("latency", "Median response latency (s)", (st) => st.responseLatencySeconds.median, 1),
    agg("balance", "Participation balance (entropy)", (st) => st.participation.entropy, 3),
  ];

  const masking = sessions.map((s) => {
    const seq = seqBySession.get(s.id) ?? [];
    const masked = seq.filter((m) => m.is_masked);
    const classes = masked.map((m) => messageFeatures(m.body).lengthClass);
    return {
      sessionLabel: labels.get(s.id)!,
      participantMessages: seq.length,
      masked: masked.length,
      ratio: seq.length ? masked.length / seq.length : null,
      short: classes.filter((c) => c === "short").length,
      longer: classes.filter((c) => c === "longer").length,
      seed: s.mask_config?.seed ?? null,
      method: s.mask_config?.method ?? (masked.length ? "manual" : "none"),
    };
  });

  // ---- Runs ---------------------------------------------------------------
  const predsByRun = new Map<string, PredictionLite[]>();
  for (const p of input.predictions) predsByRun.set(p.run_id, [...(predsByRun.get(p.run_id) ?? []), p]);
  const scoresByPred = new Map<string, ScoreRow[]>();
  for (const s of input.scores) scoresByPred.set(s.prediction_id, [...(scoresByPred.get(s.prediction_id) ?? []), s]);

  const runs = [...input.runs].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const runSummaries = runs.map((r) => summariseRun(r, predsByRun.get(r.id) ?? [], input.scores, labels));
  const selectedRun =
    runs.find((r) => r.id === options.runId) ??
    runs.find((r) => (predsByRun.get(r.id) ?? []).some((p) => p.status === "done")) ??
    runs[0] ??
    null;

  const runScores = (runId: string) => {
    const ids = new Set((predsByRun.get(runId) ?? []).map((p) => p.id));
    return input.scores.filter((s) => ids.has(s.prediction_id));
  };
  const sources = selectedRun ? listSources(runScores(selectedRun.id)) : [];
  const source = sources.find((s) => s.key === options.source) ?? sources[0] ?? null;

  const gapRowsFor = (run: RunRow, sourceKey: string | null): GapRow[] =>
    (predsByRun.get(run.id) ?? [])
      .filter((p) => p.status === "done" && p.predicted_text !== null && sessionMap.has(p.session_id))
      .map((p) => {
        const msg = messageById.get(p.message_id);
        const pos = positionOf.get(p.message_id) ?? { index: p.position_index, total: p.position_index + 1 };
        const predScores = scoresByPred.get(p.id) ?? [];
        const chosen = sourceKey ? scoreFor(sourceKey, predScores) : { score: null, tags: [], msgType: null, notes: null };
        const llmType = predScores.find((s) => s.rater_type === "llm" && s.msg_type)?.msg_type ?? null;
        const metrics = p.metrics!;
        return {
          predictionId: p.id,
          messageId: p.message_id,
          sessionId: p.session_id,
          sessionLabel: labels.get(p.session_id) ?? "",
          speaker: msg?.participant_id ? speaker.get(msg.participant_id) ?? "P?" : "P?",
          position: pos.index + 1,
          relPosition: pos.total > 1 ? pos.index / (pos.total - 1) : 0,
          lengthClass: messageFeatures(p.original_text).lengthClass,
          msgType: msg?.msg_type ?? chosen.msgType ?? llmType,
          original: p.original_text,
          predicted: p.predicted_text!,
          metrics,
          origFeatures: messageFeatures(p.original_text),
          predFeatures: messageFeatures(p.predicted_text!),
          score: chosen.score,
          scoreRounded: chosen.score === null ? null : Math.round(chosen.score),
          tags: chosen.tags,
          notes: chosen.notes,
          raterScores: Object.fromEntries(predScores.map((s) => [s.rater, s.score])),
          contextBefore: p.context_before,
          contextAfter: p.context_after,
          inputTokens: p.input_tokens,
          outputTokens: p.output_tokens,
          latencyMs: p.latency_ms,
        };
      })
      .sort((a, b) => a.sessionLabel.localeCompare(b.sessionLabel, undefined, { numeric: true }) || a.position - b.position);

  let evaluation: Evaluation | null = null;
  if (selectedRun) {
    const runSummary = runSummaries.find((r) => r.id === selectedRun.id)!;
    const gaps = gapRowsFor(selectedRun, source?.key ?? null);
    const scored = gaps.filter((g) => g.score !== null);
    const scores = scored.map((g) => g.score!);

    const distribution = [...RUBRIC]
      .sort((a, b) => b.score - a.score)
      .map((r) => {
        const count = scored.filter((g) => g.scoreRounded === r.score).length;
        return { score: r.score, label: r.label, count, share: scored.length ? count / scored.length : 0 };
      });

    const bySessionMap = new Map<string, number[]>();
    for (const g of scored) bySessionMap.set(g.sessionLabel, [...(bySessionMap.get(g.sessionLabel) ?? []), g.score!]);
    const bySession = [...bySessionMap.entries()].map(([label, xs]) => groupStat(label, label, xs));

    const shortScores = scored.filter((g) => g.lengthClass === "short").map((g) => g.score!);
    const longerScores = scored.filter((g) => g.lengthClass === "longer").map((g) => g.score!);
    const byLength = [groupStat("short", "Short reactions (≤3 words)", shortScores), groupStat("longer", "Longer messages", longerScores)];

    const byTypeMap = new Map<string, number[]>();
    for (const g of scored) {
      const key = g.msgType ?? "unclassified";
      byTypeMap.set(key, [...(byTypeMap.get(key) ?? []), g.score!]);
    }
    const typeOrder = [...MSG_TYPES.map((t) => t.id as string), "unclassified"];
    const byType = [...byTypeMap.entries()]
      .sort((a, b) => typeOrder.indexOf(a[0]) - typeOrder.indexOf(b[0]))
      .map(([key, xs]) => groupStat(key, typeLabel(key === "unclassified" ? null : key), xs));

    const thirds = [
      { key: "early", label: "Early (first third)", test: (r: number) => r < 1 / 3 },
      { key: "middle", label: "Middle third", test: (r: number) => r >= 1 / 3 && r < 2 / 3 },
      { key: "late", label: "Late (final third)", test: (r: number) => r >= 2 / 3 },
    ];
    const byThird = thirds.map((t) => groupStat(t.key, t.label, scored.filter((g) => t.test(g.relPosition)).map((g) => g.score!)));

    // Failures (score 0 or 1)
    const failures = scored.filter((g) => g.score! < 1.5);
    const tagCounts = FAILURE_TAGS.map((t) => {
      const count = failures.filter((g) => g.tags.includes(t.id)).length;
      return {
        id: t.id as string,
        label: t.label as string,
        cue: t.cue as string | null,
        count,
        shareOfFailures: failures.length ? count / failures.length : null,
        allCount: scored.filter((g) => g.tags.includes(t.id)).length,
      };
    });
    const tagByLength = FAILURE_TAGS.map((t) => ({
      id: t.id as string,
      label: t.label as string,
      short: failures.filter((g) => g.lengthClass === "short" && g.tags.includes(t.id)).length,
      longer: failures.filter((g) => g.lengthClass === "longer" && g.tags.includes(t.id)).length,
    }));
    const cues = AI_CUES.map((c) => {
      const tags = FAILURE_TAGS.filter((t) => t.cue === c.id).map((t) => t.id as string);
      const count = failures.filter((g) => g.tags.some((t) => tags.includes(t))).length;
      return { id: c.id as string, label: c.label as string, description: c.description as string, tags, count, share: failures.length ? count / failures.length : null };
    });

    // Automatic metrics
    const metrics = METRIC_INFO.map((info) => {
      const values = gaps.map((g) => g.metrics[info.key] as number);
      const paired = scored.map((g) => g.metrics[info.key] as number);
      return { key: info.key as string, label: info.label, description: info.description, summary: S.summarise(values), corr: S.spearman(paired, scores) };
    });
    const metricsByScore = [3, 2, 1, 0].map((score) => {
      const rows = scored.filter((g) => g.scoreRounded === score);
      return {
        score,
        n: rows.length,
        values: Object.fromEntries(METRIC_INFO.map((m) => [m.key, S.mean(rows.map((g) => g.metrics[m.key] as number))])),
      };
    });

    // Length and shape
    const origWords = gaps.map((g) => g.metrics.origWords);
    const predWords = gaps.map((g) => g.metrics.predWords);
    const shortGaps = gaps.filter((g) => g.lengthClass === "short");
    const length = {
      orig: S.summarise(origWords),
      pred: S.summarise(predWords),
      test: S.wilcoxonSignedRank(predWords, origWords),
      dz: S.cohensDz(predWords, origWords),
      ratioMedian: S.median(gaps.map((g) => g.metrics.lengthRatio)),
      shareLonger: share(gaps.map((g) => g.metrics.predWords > g.metrics.origWords)),
      shareShorter: share(gaps.map((g) => g.metrics.predWords < g.metrics.origWords)),
      shareSame: share(gaps.map((g) => g.metrics.predWords === g.metrics.origWords)),
      cvOrig: S.coefficientOfVariation(origWords),
      cvPred: S.coefficientOfVariation(predWords),
      shortOrigShareLongerPred: share(shortGaps.map((g) => g.predFeatures.lengthClass === "longer")),
    };

    // Style features: original vs AI (paired, McNemar) and the human baseline of the run's sessions
    const runSessionIds = new Set(selectedRun.session_ids);
    const baselineFeatures = input.messages
      .filter((m) => !m.is_operator && runSessionIds.has(m.session_id))
      .map((m) => messageFeatures(m.body));
    const style = BINARY_FEATURES.map((f) => {
      const a = gaps.map((g) => Boolean(g.origFeatures[f.key]));
      const b = gaps.map((g) => Boolean(g.predFeatures[f.key]));
      const original = share(a);
      const ai = share(b);
      return {
        key: f.key as string,
        label: f.label,
        original,
        ai,
        baseline: share(baselineFeatures.map((x) => Boolean(x[f.key]))),
        diff: original === null || ai === null ? null : ai - original,
        p: gaps.length ? S.mcNemarExact(b, a).p : null,
      };
    });

    // Agreement between raters
    const raterTypes = new Map<string, string>();
    for (const s of runScores(selectedRun.id)) raterTypes.set(s.rater, s.rater_type);
    const raters = [...raterTypes.keys()].sort((a, b) =>
      raterTypes.get(a) === raterTypes.get(b) ? a.localeCompare(b) : raterTypes.get(a) === "human" ? -1 : 1,
    );
    const agreement: Evaluation["agreement"] = [];
    for (let i = 0; i < raters.length; i++) {
      for (let j = i + 1; j < raters.length; j++) {
        const both = gaps.filter((g) => raters[i] in g.raterScores && raters[j] in g.raterScores);
        agreement.push({
          a: raters[i],
          b: raters[j],
          ...S.agreement(both.map((g) => g.raterScores[raters[i]]), both.map((g) => g.raterScores[raters[j]])),
        });
      }
    }

    const inputTokens = S.sum(gaps.map((g) => g.inputTokens ?? 0));
    const outputTokens = S.sum(gaps.map((g) => g.outputTokens ?? 0));
    const price = PRICES[selectedRun.model];

    evaluation = {
      run: runSummary,
      source: source ?? { key: "none", label: "No scores yet", count: 0 },
      nPredictions: gaps.length,
      n: scored.length,
      summary: S.summarise(scores),
      ci95: S.bootstrapMeanCI(scores),
      distribution,
      shareAtLeast2: share(scored.map((g) => g.score! >= 1.5)),
      bySession,
      sessionTest: S.kruskalWallis(bySession.map((b) => bySessionMap.get(b.key)!)),
      byLength,
      lengthTest: S.mannWhitneyU(shortScores, longerScores),
      byType,
      typeTest: S.kruskalWallis([...byTypeMap.entries()].filter(([k]) => k !== "unclassified").map(([, xs]) => xs)),
      byThird,
      positionCorr: S.spearman(scored.map((g) => g.relPosition), scores),
      contextCorr: S.spearman(scored.map((g) => g.contextBefore ?? 0), scores),
      failures: {
        n: failures.length,
        share: scored.length ? failures.length / scored.length : null,
        tags: tagCounts,
        byLength: tagByLength,
        untagged: failures.filter((g) => g.tags.length === 0).length,
      },
      cues,
      metrics,
      metricsByScore,
      length,
      style,
      agreement,
      usage: {
        inputTokens,
        outputTokens,
        meanLatencyMs: S.mean(gaps.map((g) => g.latencyMs).filter((x): x is number => x !== null)),
        costUsd: price ? (inputTokens * price[0] + outputTokens * price[1]) / 1_000_000 : null,
      },
      gaps,
    };
  }

  // ---- Comparisons between runs ---------------------------------------------
  const comparisons: RunComparison[] = [];
  if (selectedRun) {
    const baseRows = gapRowsFor(selectedRun, source?.key ?? null);
    const baseById = new Map(baseRows.map((g) => [g.messageId, g]));
    for (const other of runs) {
      if (other.id === selectedRun.id) continue;
      const otherSources = listSources(runScores(other.id));
      const sharedKey =
        source && otherSources.some((s) => s.key === source.key) ? source.key : otherSources[0]?.key ?? null;
      const otherRows = gapRowsFor(other, sharedKey).filter((g) => baseById.has(g.messageId));
      if (!otherRows.length) continue;
      const pairs = otherRows.map((g) => [baseById.get(g.messageId)!, g] as const);
      const scoredPairs = pairs.filter(([a, b]) => a.score !== null && b.score !== null);
      comparisons.push({
        runId: other.id,
        name: other.name,
        configDiff: configDiff(selectedRun.config, other.config).concat(
          selectedRun.model !== other.model ? [`model: ${selectedRun.model} → ${other.model}`] : [],
        ),
        nPaired: pairs.length,
        scoreSource: sharedKey,
        scoreA: scoredPairs.length ? S.mean(scoredPairs.map(([a]) => a.score!)) : null,
        scoreB: scoredPairs.length ? S.mean(scoredPairs.map(([, b]) => b.score!)) : null,
        scoreTest: scoredPairs.length ? S.wilcoxonSignedRank(scoredPairs.map(([a]) => a.score!), scoredPairs.map(([, b]) => b.score!)) : null,
        metrics: (["chrF", "tokenF1", "rougeL", "bleu", "editSimilarity"] as const).map((key) => ({
          key,
          label: METRIC_INFO.find((m) => m.key === key)!.label,
          meanA: S.mean(pairs.map(([a]) => a.metrics[key])),
          meanB: S.mean(pairs.map(([, b]) => b.metrics[key])),
          test: S.wilcoxonSignedRank(pairs.map(([a]) => a.metrics[key]), pairs.map(([, b]) => b.metrics[key])),
        })),
      });
    }
  }

  const overview = {
    groups: input.groups.length,
    participants: input.participants.length,
    sessions: sessions.length,
    sessionsEnded: sessions.filter((s) => s.status === "ended").length,
    participantMessages: input.messages.filter((m) => !m.is_operator).length,
    operatorMessages: input.messages.filter((m) => m.is_operator).length,
    masked: input.messages.filter((m) => m.is_masked).length,
    runs: runs.length,
    withdrawals: input.withdrawals,
  };

  const report: ResultsReport = {
    generatedAt: new Date().toISOString(),
    overview,
    sessions: sessionSummaries,
    sessionAggregate,
    masking,
    runs: runSummaries,
    selectedRunId: selectedRun?.id ?? null,
    sources,
    evaluation,
    comparisons,
    methodsText: "",
    resultsText: "",
  };
  report.methodsText = methodsText(report, selectedRun, sessions);
  report.resultsText = resultsText(report);
  return report;
}

// ---- Auto-written paragraphs (starting points for the thesis text) ----------

function methodsText(report: ResultsReport, run: RunRow | null, sessions: SessionRow[]): string {
  const o = report.overview;
  const ended = sessions.filter((s) => s.status === "ended");
  const minutes = S.mean(ended.map((s) => s.duration_seconds / 60));
  const maskCfg = sessions.find((s) => s.mask_config)?.mask_config;
  const seeds = [...new Set(sessions.filter((s) => s.mask_config?.method === "random").map((s) => s.mask_config!.seed))];
  const lines: string[] = [];
  lines.push(
    `Data collection. ${o.participants} participant${o.participants === 1 ? "" : "s"} in ${o.groups} group${o.groups === 1 ? "" : "s"} took part in ${o.sessionsEnded} recorded group chat session${o.sessionsEnded === 1 ? "" : "s"}` +
      (minutes !== null ? ` of ${num(minutes, 0)} minutes each` : "") +
      `, each on a neutral topic seed. Participants used made-up names; no other identifying information was collected. ` +
      `In total ${o.participantMessages} participant messages were recorded. ${o.operatorMessages} messages sent by the researcher acting as moderator were stored but excluded from all masking, prediction and analysis.` +
      (o.withdrawals ? ` ${o.withdrawals} withdrawal${o.withdrawals === 1 ? "" : "s"} occurred; the affected conversations were deleted in full.` : ""),
  );
  if (o.masked) {
    lines.push(
      `Gap selection. ${o.masked} messages (${pct(o.participantMessages ? o.masked / o.participantMessages : null, 1)} of participant messages) were hidden` +
        (maskCfg
          ? ` using seeded random selection (${seeds.length > 1 ? `seeds ${seeds.join(", ")}` : `seed ${maskCfg.seed}`}, target ratio ${pct(maskCfg.ratio)}), never choosing one of the first ${maskCfg.skipFirst} messages${maskCfg.protectLast ? " or the final message" : ""}${maskCfg.noAdjacent ? " and never two consecutive messages" : ""}, so that every gap had context on both sides`
          : "") +
        `. Moderator messages were never eligible.`,
    );
  }
  if (run) {
    const c = run.config;
    lines.push(
      `Prediction. Each gap was filled by ${run.model} via the Anthropic Messages API with adaptive thinking (effort "${c.effort}") and a structured JSON output containing only the message text. ` +
        `The model received ${c.contextMode === "bidirectional" ? "the conversation on both sides of the gap" : "only the conversation before the gap"}` +
        `${c.windowBefore !== null || c.windowAfter !== null ? ` (window: ${c.windowBefore ?? "all"} messages before, ${c.contextMode === "bidirectional" ? c.windowAfter ?? "all" : 0} after)` : " (the full transcript)"}` +
        `, with other gaps ${c.otherGaps === "visible" ? "shown as originally written" : "also hidden"}, the speaker's made-up name ${c.revealSpeaker ? "given" : "withheld"}, the topic seed ${c.includeTopic ? "included" : "omitted"}, and moderator messages ${c.includeOperator ? "included and labelled as the researcher" : "removed"}. ` +
        `The model never saw the original message. Each request was made independently, one gap at a time, and the exact prompt, model identifier, token usage and latency were stored alongside every prediction.`,
    );
  }
  lines.push(
    `Scoring. Each AI message was scored against the original on a four-point rubric: 3 = same meaning, similar style; 2 = same meaning, different style; 1 = different meaning but still fits; 0 = doesn't fit at all. ` +
      `Messages scoring 0 or 1 were tagged with one or more failure categories (wrong tone, too formal, over-explaining, generic/impersonal, wrong length, missed shared context, missed running joke, wrong intent, off topic). ` +
      `Messages of three words or fewer were classed as short reactions and analysed separately from longer messages. ` +
      `${report.sources.some((s) => s.label.startsWith("LLM")) ? "An LLM judge applying the same rubric (answering same-meaning, similar-style and fits-context questions that map deterministically to the 0–3 scale) was used as a secondary rater, and its agreement with human scores is reported as quadratic-weighted Cohen's kappa. " : ""}` +
      `Automatic similarity metrics (token F1, sentence BLEU, ROUGE-L, chrF and normalised edit similarity) were computed for every pair.`,
  );
  lines.push(
    `Statistics. Score distributions are reported with means, standard deviations and 95% bootstrap confidence intervals (5,000 resamples). Groups were compared with Mann–Whitney U and Kruskal–Wallis tests, paired original-versus-AI comparisons with Wilcoxon signed-rank tests (continuous) and exact McNemar tests (binary features), and associations with Spearman's rank correlation. With roughly 30 gaps these tests have limited power and are reported as descriptive support rather than confirmatory evidence.`,
  );
  return lines.join("\n\n");
}

function resultsText(report: ResultsReport): string {
  const e = report.evaluation;
  if (!e || e.n === 0) {
    return "No scored predictions yet. Run predictions, then score them (by hand and/or with the LLM judge) to generate this summary.";
  }
  const lines: string[] = [];
  const top = e.distribution.find((d) => d.score === 3)!;
  const zero = e.distribution.find((d) => d.score === 0)!;
  lines.push(
    `Across ${e.n} scored gaps (${e.source.label}), the AI replacements averaged ${num(e.summary.mean)} out of 3 (SD ${num(e.summary.sd)}, median ${num(e.summary.median, 1)}` +
      `${e.ci95 ? `, 95% CI ${num(e.ci95[0])}–${num(e.ci95[1])}` : ""}). ` +
      `${pct(top.share)} matched in both meaning and style, ${pct(e.shareAtLeast2)} preserved the meaning, and ${pct(zero.share)} did not fit the conversation at all.`,
  );
  const [shortG, longG] = e.byLength;
  if (shortG.n && longG.n) {
    lines.push(
      `Short reactions (≤3 words, n = ${shortG.n}) scored ${num(shortG.mean)} on average against ${num(longG.mean)} for longer messages (n = ${longG.n}; Mann–Whitney U = ${num(e.lengthTest.statistic, 1)}, ${pText(e.lengthTest.p)}).`,
    );
  }
  if (e.bySession.length > 1) {
    const best = [...e.bySession].sort((a, b) => (b.mean ?? 0) - (a.mean ?? 0));
    lines.push(
      `By conversation, mean scores ranged from ${num(best[best.length - 1].mean)} (${best[best.length - 1].label}) to ${num(best[0].mean)} (${best[0].label})` +
        `${e.sessionTest.p !== null ? ` (Kruskal–Wallis H = ${num(e.sessionTest.statistic)}, df = ${e.sessionTest.df}, ${pText(e.sessionTest.p)})` : ""}.`,
    );
  }
  if (e.failures.n) {
    const tags = [...e.failures.tags].filter((t) => t.count > 0).sort((a, b) => b.count - a.count);
    const cues = [...e.cues].filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
    lines.push(
      `${e.failures.n} gaps (${pct(e.failures.share)}) scored 0 or 1. ` +
        (tags.length
          ? `The most frequent failure categories were ${tags.slice(0, 3).map((t) => `${t.label.toLowerCase()} (${t.count}, ${pct(t.shareOfFailures)})`).join(", ")}. `
          : "") +
        (cues.length
          ? `Mapped onto the cues people report using to spot AI text, failures most often involved ${cues.slice(0, 2).map((c) => `${c.label.toLowerCase()} (${pct(c.share)} of failures)`).join(" and ")}.`
          : ""),
    );
  }
  const L = e.length;
  lines.push(
    `AI messages averaged ${num(L.pred.mean, 1)} words against ${num(L.orig.mean, 1)} for the originals (Wilcoxon signed-rank ${pText(L.test.p)}); ${pct(L.shareLonger)} were longer than the message they replaced. ` +
      `Length varied ${L.cvPred !== null && L.cvOrig !== null && L.cvPred < L.cvOrig ? "less" : "more"} across AI messages than across the originals (coefficient of variation ${num(L.cvPred)} vs ${num(L.cvOrig)})` +
      `${L.cvPred !== null && L.cvOrig !== null && L.cvPred < L.cvOrig ? ", consistent with the 'uniform shape' cue" : ""}.`,
  );
  const bigStyle = [...e.style].filter((s) => s.diff !== null && Math.abs(s.diff) >= 0.1).sort((a, b) => Math.abs(b.diff!) - Math.abs(a.diff!));
  if (bigStyle.length) {
    lines.push(
      `The largest stylistic differences were: ${bigStyle.slice(0, 4).map((s) => `${s.label.toLowerCase()} (${pct(s.original)} of originals vs ${pct(s.ai)} of AI messages)`).join("; ")}.`,
    );
  }
  const bestMetric = [...e.metrics].filter((m) => m.corr.rho !== null).sort((a, b) => (b.corr.rho ?? 0) - (a.corr.rho ?? 0))[0];
  if (bestMetric) {
    lines.push(
      `Of the automatic metrics, ${bestMetric.label} tracked the rubric score most closely (Spearman ρ = ${num(bestMetric.corr.rho)}, ${pText(bestMetric.corr.p)}).`,
    );
  }
  for (const a of e.agreement.filter((x) => x.n > 0)) {
    lines.push(
      `Agreement between ${a.a.replace(/^llm:/, "LLM judge ")} and ${a.b.replace(/^llm:/, "LLM judge ")} on ${a.n} gaps: exact ${pct(a.exact)}, within one point ${pct(a.withinOne)}, quadratic-weighted κ = ${num(a.weightedKappa)}.`,
    );
  }
  return lines.join("\n\n");
}

export { tagLabel };
