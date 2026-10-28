// CSV and Markdown renderings of the report for the thesis and appendices.
import { FAILURE_TAGS, RUBRIC, tagLabel, typeLabel } from "../constants";
import { num, pct, pText, seconds } from "../format";
import { METRIC_INFO } from "../text/metrics";
import type { MessageRow } from "../types";
import type { ResultsReport } from "./report";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "number" ? (Number.isInteger(value) ? String(value) : value.toFixed(4)) : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return [headers.join(","), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(","))].join("\n");
}

export function predictionsCsv(report: ResultsReport): string {
  const e = report.evaluation;
  if (!e) return "";
  const raters = [...new Set(e.gaps.flatMap((g) => Object.keys(g.raterScores)))].sort();
  return toCsv(
    e.gaps.map((g) => ({
      run: e.run.name,
      session: g.sessionLabel,
      message_id: g.messageId,
      position: g.position,
      relative_position: g.relPosition,
      speaker: g.speaker,
      length_class: g.lengthClass,
      message_type: g.msgType ?? "",
      original: g.original,
      ai: g.predicted,
      score: g.score,
      score_source: e.source.label,
      failure_tags: g.tags.join("; "),
      notes: g.notes ?? "",
      ...Object.fromEntries(raters.map((r) => [`score_${r}`, g.raterScores[r] ?? null])),
      ...Object.fromEntries(METRIC_INFO.map((m) => [`metric_${m.key}`, g.metrics[m.key]])),
      orig_words: g.metrics.origWords,
      ai_words: g.metrics.predWords,
      length_ratio: g.metrics.lengthRatio,
      context_before: g.contextBefore,
      context_after: g.contextAfter,
      input_tokens: g.inputTokens,
      output_tokens: g.outputTokens,
      latency_ms: g.latencyMs,
    })),
  );
}

export function sessionsCsv(report: ResultsReport): string {
  return toCsv(
    report.sessions.map((s) => ({
      session: s.label,
      title: s.title,
      topic: s.topic,
      status: s.status,
      started_at: s.startedAt,
      ended_at: s.endedAt,
      participant_messages: s.participantMessages,
      moderator_messages: s.operatorMessages,
      gaps: s.masked,
      duration_min: s.stats?.actualDurationSec != null ? s.stats.actualDurationSec / 60 : null,
      speakers: s.stats?.speakers,
      words: s.stats?.words,
      messages_per_min: s.stats?.messagesPerMinute,
      words_per_msg_mean: s.stats?.wordsPerMessage.mean,
      words_per_msg_median: s.stats?.wordsPerMessage.median,
      words_per_msg_sd: s.stats?.wordsPerMessage.sd,
      share_short: s.stats?.shares.short,
      share_question: s.stats?.shares.question,
      share_exclamation: s.stats?.shares.exclamation,
      share_emoji: s.stats?.shares.emoji,
      share_laughter: s.stats?.shares.laughter,
      share_slang: s.stats?.shares.slang,
      share_first_person: s.stats?.shares.firstPerson,
      share_starts_lowercase: s.stats?.shares.startsLowercase,
      share_ends_punctuation: s.stats?.shares.endsWithPunctuation,
      type_token_ratio: s.stats?.typeTokenRatio,
      speaker_switch_rate: s.stats?.speakerSwitchRate,
      mean_burst_length: s.stats?.meanBurstLength,
      median_gap_s: s.stats?.gapSeconds.median,
      median_response_latency_s: s.stats?.responseLatencySeconds.median,
      participation_entropy: s.stats?.participation.entropy,
      participation_gini: s.stats?.participation.gini,
    })),
  );
}

export function transcriptsCsv(
  report: ResultsReport,
  messages: MessageRow[],
  speakerOf: (participantId: string | null) => string,
): string {
  const labels = new Map(report.sessions.map((s) => [s.id, s]));
  const starts = new Map<string, number>();
  for (const m of messages) if (!starts.has(m.session_id)) starts.set(m.session_id, Date.parse(m.created_at));
  const seq = new Map<string, number>();
  return toCsv(
    messages
      .filter((m) => labels.has(m.session_id))
      .map((m) => {
        const n = m.is_operator ? null : (seq.get(m.session_id) ?? 0) + 1;
        if (n !== null) seq.set(m.session_id, n);
        return {
          session: labels.get(m.session_id)!.label,
          seq: n,
          seconds_from_start: (Date.parse(m.created_at) - (starts.get(m.session_id) ?? 0)) / 1000,
          speaker: m.is_operator ? "Moderator" : speakerOf(m.participant_id),
          moderator: m.is_operator ? 1 : 0,
          masked: m.is_masked ? 1 : 0,
          message_type: m.msg_type ?? "",
          text: m.body,
        };
      }),
  );
}

function table(headers: string[], rows: (string | number)[][]): string {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.map((c) => String(c).replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`),
  ].join("\n");
}

export function reportMarkdown(report: ResultsReport): string {
  const out: string[] = [];
  const o = report.overview;
  out.push(`# Results report`, ``, `Generated ${new Date(report.generatedAt).toLocaleString("en-AU")}.`, ``);
  out.push(`## Overview`, ``);
  out.push(
    table(
      ["Measure", "Value"],
      [
        ["Groups", o.groups],
        ["Participants", o.participants],
        ["Sessions (ended)", `${o.sessions} (${o.sessionsEnded})`],
        ["Participant messages", o.participantMessages],
        ["Moderator messages (excluded)", o.operatorMessages],
        ["Gaps (masked messages)", o.masked],
        ["Prediction runs", o.runs],
        ["Withdrawals", o.withdrawals],
      ],
    ),
    ``,
  );

  out.push(`## Method summary`, ``, report.methodsText, ``);

  out.push(`## Table 1. Conversation statistics by session`, ``);
  out.push(
    table(
      ["Session", "Msgs", "Min", "Msgs/min", "Words/msg", "Short", "Questions", "Emoji", "Switch rate", "Balance"],
      report.sessions
        .filter((s) => s.stats)
        .map((s) => [
          s.label,
          s.stats!.messages,
          num(s.stats!.actualDurationSec !== null ? s.stats!.actualDurationSec / 60 : null, 1),
          num(s.stats!.messagesPerMinute, 1),
          num(s.stats!.wordsPerMessage.mean, 1),
          pct(s.stats!.shares.short),
          pct(s.stats!.shares.question),
          pct(s.stats!.shares.emoji),
          num(s.stats!.speakerSwitchRate, 2),
          num(s.stats!.participation.entropy, 2),
        ]),
    ),
    ``,
  );
  out.push(
    table(
      ["Across sessions", "Mean", "SD", "Min", "Max"],
      report.sessionAggregate.map((a) => {
        const f = (x: number | null) => (a.percent ? pct(x, 1) : num(x, a.digits));
        return [a.label, f(a.summary.mean), f(a.summary.sd), f(a.summary.min), f(a.summary.max)];
      }),
    ),
    ``,
  );

  out.push(`## Table 2. Gap selection`, ``);
  out.push(
    table(
      ["Session", "Participant msgs", "Gaps", "Ratio", "Short", "Longer", "Seed", "Method"],
      report.masking.map((m) => [m.sessionLabel, m.participantMessages, m.masked, pct(m.ratio, 1), m.short, m.longer, m.seed ?? "–", m.method]),
    ),
    ``,
  );

  const e = report.evaluation;
  if (e) {
    out.push(`## Evaluation: ${e.run.name}`, ``);
    out.push(`Model ${e.run.model}; score source: ${e.source.label}; ${e.n} of ${e.nPredictions} predictions scored.`, ``);

    const P = e.plain;
    if (P.scored) {
      out.push(`### At a glance`, ``, ...P.findings.map((f) => `- ${f}`), ``);
      out.push(table(["Outcome", "What it means", "Gaps", "%"], P.outcomes.map((o) => [`${o.score} · ${o.title}`, o.description, o.count, pct(o.share)])), ``);
      const plainTable = (title: string, rows: typeof P.byType) => {
        out.push(`#### ${title}`, ``);
        out.push(
          table(
            ["", "Gaps", "Avg score", "Meaning kept", "Nailed it", "Didn't fit", "Most common problem"],
            rows.map((g) => [g.label, g.n, num(g.avg, 1), `${g.meaningKept} (${pct(g.n ? g.meaningKept / g.n : null)})`, g.fullMatch, g.noFit, g.topProblem ? `${g.topProblem.label} (${g.topProblem.count})` : "–"]),
          ),
          ``,
        );
      };
      plainTable("By message type", P.byType);
      plainTable("Short reactions vs longer messages", P.byLength);
      plainTable("By conversation", P.bySession);
      out.push(`#### Scores by message type (number of gaps)`, ``);
      out.push(table(["Type", "3", "2", "1", "0", "Total"], P.typeScore.map((r) => [r.label, r.counts[3], r.counts[2], r.counts[1], r.counts[0], r.n])), ``);
      if (P.typeProblem.problems.length) {
        out.push(`#### Problems by message type (number of gaps)`, ``);
        out.push(table(["Type", ...P.typeProblem.problems.map((p) => p.label)], P.typeProblem.types.map((t, i) => [t.label, ...P.typeProblem.cells[i]])), ``);
      }
      if (P.problems.length) {
        out.push(`#### What went wrong`, ``);
        out.push(
          table(
            ["Problem", "Gaps", "% of gaps", "Mostly in", "Example (paraphrase before use)"],
            P.problems.map((p) => [p.label, p.count, pct(p.share), p.types.join(", ") || "–", p.example ? `"${p.example.original}" → "${p.example.predicted}"` : "–"]),
          ),
          ``,
        );
      }
    }
    out.push(`### Table 3. Score distribution`, ``);
    out.push(table(["Score", "Meaning", "n", "%"], e.distribution.map((d) => [d.score, d.label, d.count, pct(d.share, 1)])), ``);
    out.push(
      `Mean ${num(e.summary.mean)} (SD ${num(e.summary.sd)}), median ${num(e.summary.median, 1)}, IQR ${num(e.summary.q1, 1)}–${num(e.summary.q3, 1)}` +
        `${e.ci95 ? `, 95% bootstrap CI ${num(e.ci95[0])}–${num(e.ci95[1])}` : ""}.`,
      ``,
    );
    const groupTable = (title: string, rows: typeof e.bySession, note?: string) => {
      out.push(`### ${title}`, ``);
      out.push(
        table(
          ["Group", "n", "Mean", "SD", "Median", "3", "2", "1", "0"],
          rows.map((g) => [g.label, g.n, num(g.mean), num(g.sd), num(g.median, 1), g.dist[3], g.dist[2], g.dist[1], g.dist[0]]),
        ),
        ``,
      );
      if (note) out.push(note, ``);
    };
    groupTable(
      "Table 4. Scores by conversation",
      e.bySession,
      e.sessionTest.statistic !== null ? `Kruskal–Wallis H = ${num(e.sessionTest.statistic)}, df = ${e.sessionTest.df}, ${pText(e.sessionTest.p)}.` : undefined,
    );
    groupTable(
      "Table 5. Short reactions vs longer messages",
      e.byLength,
      e.lengthTest.statistic !== null ? `Mann–Whitney U = ${num(e.lengthTest.statistic, 1)}, z = ${num(e.lengthTest.z)}, ${pText(e.lengthTest.p)}, r = ${num(e.lengthTest.effect)}.` : undefined,
    );
    groupTable(
      "Table 6. Scores by message type",
      e.byType,
      e.typeTest.statistic !== null ? `Kruskal–Wallis H = ${num(e.typeTest.statistic)}, df = ${e.typeTest.df}, ${pText(e.typeTest.p)}.` : undefined,
    );
    groupTable(
      "Table 7. Scores by position in the conversation",
      e.byThird,
      `Spearman ρ (relative position vs score) = ${num(e.positionCorr.rho)}, ${pText(e.positionCorr.p)}; ρ (messages of preceding context vs score) = ${num(e.contextCorr.rho)}, ${pText(e.contextCorr.p)}.`,
    );

    out.push(`### Table 8. Failure categories (score 0–1, n = ${e.failures.n})`, ``);
    out.push(
      table(
        ["Category", "Cue", "Failures", "% of failures", "Short", "Longer", "Tagged at any score"],
        e.failures.tags.map((t) => {
          const byLen = e.failures.byLength.find((b) => b.id === t.id)!;
          return [t.label, t.cue ?? "–", t.count, pct(t.shareOfFailures), byLen.short, byLen.longer, t.allCount];
        }),
      ),
      ``,
      `Failures with no tag: ${e.failures.untagged}. A failure can carry several tags, so percentages can sum to more than 100%.`,
      ``,
    );
    out.push(`### Table 9. Failures mapped to AI-detection cues`, ``);
    out.push(
      table(
        ["Cue", "What people notice", "Failure tags", "Failures", "% of failures"],
        e.cues.map((c) => [c.label, c.description, c.tags.map(tagLabel).join(", "), c.count, pct(c.share)]),
      ),
      ``,
    );

    out.push(`### Table 10. Length and shape`, ``);
    const L = e.length;
    out.push(
      table(
        ["", "Original", "AI"],
        [
          ["Mean words", num(L.orig.mean, 2), num(L.pred.mean, 2)],
          ["SD words", num(L.orig.sd, 2), num(L.pred.sd, 2)],
          ["Median words", num(L.orig.median, 1), num(L.pred.median, 1)],
          ["Coefficient of variation", num(L.cvOrig), num(L.cvPred)],
        ],
      ),
      ``,
      `Wilcoxon signed-rank (AI vs original words): T = ${num(L.test.statistic, 1)}, z = ${num(L.test.z)}, ${pText(L.test.p)}, d_z = ${num(L.dz)}. ` +
        `AI longer in ${pct(L.shareLonger)}, shorter in ${pct(L.shareShorter)}, same length in ${pct(L.shareSame)}; median length ratio ${num(L.ratioMedian)}. ` +
        `Of originals that were short reactions, ${pct(L.shortOrigShareLongerPred)} were replaced by a longer AI message.`,
      ``,
    );

    out.push(`### Table 11. Style features (share of messages)`, ``);
    out.push(
      table(
        ["Feature", "All human msgs", "Originals", "AI", "Difference", "McNemar p"],
        e.style.map((s) => [s.label, pct(s.baseline), pct(s.original), pct(s.ai), s.diff === null ? "–" : `${s.diff >= 0 ? "+" : ""}${(s.diff * 100).toFixed(0)} pts`, pText(s.p).replace(/^p = /, "").replace(/^p /, "")]),
      ),
      ``,
    );

    out.push(`### Table 12. Automatic metrics`, ``);
    out.push(
      table(
        ["Metric", "Mean", "SD", "Median", "Spearman ρ with score", "p"],
        e.metrics.map((m) => [m.label, num(m.summary.mean, 3), num(m.summary.sd, 3), num(m.summary.median, 3), num(m.corr.rho), pText(m.corr.p).replace(/^p = /, "").replace(/^p /, "")]),
      ),
      ``,
    );
    out.push(
      table(
        ["Score", "n", ...METRIC_INFO.map((m) => m.label)],
        e.metricsByScore.map((r) => [r.score, r.n, ...METRIC_INFO.map((m) => num(r.values[m.key], 3))]),
      ),
      ``,
    );

    if (e.agreement.length) {
      out.push(`### Table 13. Inter-rater agreement`, ``);
      out.push(
        table(
          ["Rater A", "Rater B", "n", "Exact", "Within 1", "Cohen's κ", "Weighted κ (quadratic)"],
          e.agreement.map((a) => [a.a, a.b, a.n, pct(a.exact), pct(a.withinOne), num(a.kappa), num(a.weightedKappa)]),
        ),
        ``,
      );
    }

    if (report.comparisons.length) {
      out.push(`### Table 14. Comparison with other runs (paired on the same gaps)`, ``);
      out.push(
        table(
          ["Run", "Differences", "n", "Score (this run)", "Score (other)", "Wilcoxon p", "chrF (this)", "chrF (other)"],
          report.comparisons.map((c) => {
            const chrf = c.metrics.find((m) => m.key === "chrF")!;
            return [c.name, c.configDiff.join("; ") || "–", c.nPaired, num(c.scoreA), num(c.scoreB), c.scoreTest ? pText(c.scoreTest.p) : "–", num(chrf.meanA, 3), num(chrf.meanB, 3)];
          }),
        ),
        ``,
      );
    }

    out.push(`### Usage`, ``);
    out.push(
      `Input tokens ${e.usage.inputTokens.toLocaleString()}, output tokens (incl. thinking) ${e.usage.outputTokens.toLocaleString()}, mean latency ${seconds(e.usage.meanLatencyMs === null ? null : e.usage.meanLatencyMs / 1000)}` +
        `${e.usage.costUsd !== null ? `, estimated cost US$${e.usage.costUsd.toFixed(2)}` : ""}.`,
      ``,
    );

    out.push(`## Results summary (draft text)`, ``, report.resultsText, ``);

    out.push(`## Appendix: all gaps`, ``);
    out.push(`Paraphrase any example before quoting it in the thesis (groups of three make verbatim quotes traceable).`, ``);
    out.push(
      table(
        ["Session", "#", "Type", "Original", "AI", "Score", "Tags"],
        e.gaps.map((g) => [g.sessionLabel, g.position, typeLabel(g.msgType), g.original, g.predicted, g.score === null ? "–" : num(g.score, g.score % 1 ? 1 : 0), g.tags.map(tagLabel).join(", ")]),
      ),
      ``,
    );
  }

  out.push(`---`, ``, `Rubric: ${RUBRIC.map((r) => `${r.score} = ${r.label}`).join("; ")}.`, ``);
  out.push(`Failure categories: ${FAILURE_TAGS.map((t) => `${t.label} (${t.description})`).join("; ")}.`);
  return out.join("\n");
}
