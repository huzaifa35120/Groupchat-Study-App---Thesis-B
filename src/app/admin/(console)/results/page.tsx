"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { ColumnChart, HBarChart, PairedHBarChart } from "@/components/charts";
import { Badge, Button, Card, Empty, Notice, PageHeader, Select, Spinner, Stat, cx } from "@/components/ui";
import type { GroupStat, ResultsReport } from "@/lib/analysis/report";
import { useApi } from "@/lib/client";
import { tagLabel, typeLabel } from "@/lib/constants";
import { dateTime, num, pct, pText, seconds } from "@/lib/format";

export default function ResultsPage() {
  return (
    <Suspense fallback={<div className="flex items-center gap-2 text-sm text-stone-500"><Spinner /> Loading…</div>}>
      <Results />
    </Suspense>
  );
}

function Results() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const run = params.get("run");
  const source = params.get("source");
  const query = new URLSearchParams();
  if (run) query.set("run", run);
  if (source) query.set("source", source);
  const { data, error, loading, reload } = useApi<ResultsReport>(`/api/admin/results?${query}`);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "run") next.delete("source");
    router.replace(`${pathname}?${next}`);
  };

  const exportUrl = (kind: string) => {
    const q = new URLSearchParams(query);
    q.set("kind", kind);
    if (data?.selectedRunId) q.set("run", data.selectedRunId);
    if (data?.evaluation) q.set("source", data.evaluation.source.key);
    return `/api/admin/export?${q}`;
  };

  if (error && !data) return <Notice tone="error">{error}</Notice>;
  if (!data) return <div className="flex items-center gap-2 text-sm text-stone-500"><Spinner /> Building report…</div>;

  const o = data.overview;
  const e = data.evaluation;

  return (
    <>
      <PageHeader
        title="Results"
        description={`Everything recorded so far, recalculated live. Generated ${dateTime(data.generatedAt)}.`}
        actions={
          <>
            <Button variant="secondary" size="sm" busy={loading} onClick={() => void reload()}>Refresh</Button>
            <ExportMenu exportUrl={exportUrl} />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="Participants" value={o.participants} hint={`${o.groups} group${o.groups === 1 ? "" : "s"}`} />
        <Stat label="Sessions" value={o.sessionsEnded} hint={`of ${o.sessions} ended`} />
        <Stat label="Messages" value={o.participantMessages} hint="participants only" />
        <Stat label="Moderator" value={o.operatorMessages} hint="excluded" />
        <Stat label="Gaps" value={o.masked} hint={pct(o.participantMessages ? o.masked / o.participantMessages : null, 1)} />
        <Stat label="AI runs" value={o.runs} />
        <Stat label="Withdrawals" value={o.withdrawals} />
      </div>

      <Section title="Session records" description="Written automatically at the end of each session. Moderator messages are excluded.">
        {data.sessions.length === 0 ? (
          <Empty>No sessions yet.</Empty>
        ) : (
          <div className="grid gap-6">
            <Card title="Per session">
              <Scroll>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Session</th><th>Status</th><th className="num">Msgs</th><th className="num">Minutes</th><th className="num">Msgs/min</th><th className="num">Words/msg</th>
                      <th className="num">Short</th><th className="num">Questions</th><th className="num">Emoji</th><th className="num">Laughter</th><th className="num">TTR</th><th className="num">Switch</th><th className="num">Reply (s)</th><th className="num">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sessions.map((s) => (
                      <tr key={s.id}>
                        <td className="whitespace-nowrap"><Link href={`/admin/sessions/${s.id}`} className="font-medium hover:underline">{s.label}</Link><div className="max-w-56 truncate text-xs text-stone-500" title={s.topic}>{s.topic}</div></td>
                        <td><Badge tone={s.status === "ended" ? "neutral" : s.status === "live" ? "green" : "amber"}>{s.status}</Badge></td>
                        {s.stats ? (
                          <>
                            <td className="num">{s.stats.messages}</td>
                            <td className="num">{num(s.stats.actualDurationSec !== null ? s.stats.actualDurationSec / 60 : null, 1)}</td>
                            <td className="num">{num(s.stats.messagesPerMinute, 1)}</td>
                            <td className="num">{num(s.stats.wordsPerMessage.mean, 1)}</td>
                            <td className="num">{pct(s.stats.shares.short)}</td>
                            <td className="num">{pct(s.stats.shares.question)}</td>
                            <td className="num">{pct(s.stats.shares.emoji)}</td>
                            <td className="num">{pct(s.stats.shares.laughter)}</td>
                            <td className="num">{num(s.stats.typeTokenRatio, 2)}</td>
                            <td className="num">{pct(s.stats.speakerSwitchRate)}</td>
                            <td className="num">{num(s.stats.responseLatencySeconds.median, 1)}</td>
                            <td className="num">{num(s.stats.participation.entropy, 2)}</td>
                          </>
                        ) : (
                          <td colSpan={12} className="text-stone-400">Recorded when the session ends</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Scroll>
            </Card>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Across sessions" description="Mean, SD and range of each session-level figure.">
                <table className="data">
                  <thead><tr><th>Measure</th><th className="num">Mean</th><th className="num">SD</th><th className="num">Min</th><th className="num">Max</th></tr></thead>
                  <tbody>
                    {data.sessionAggregate.map((a) => {
                      const f = (x: number | null) => (a.percent ? pct(x, 1) : num(x, a.digits));
                      return <tr key={a.key}><td>{a.label}</td><td className="num">{f(a.summary.mean)}</td><td className="num">{f(a.summary.sd)}</td><td className="num">{f(a.summary.min)}</td><td className="num">{f(a.summary.max)}</td></tr>;
                    })}
                  </tbody>
                </table>
              </Card>
              <Card title="Gap selection" description="Messages hidden in each session.">
                <table className="data">
                  <thead><tr><th>Session</th><th className="num">Msgs</th><th className="num">Gaps</th><th className="num">Ratio</th><th className="num">Short</th><th className="num">Longer</th><th>Method</th></tr></thead>
                  <tbody>
                    {data.masking.map((m) => (
                      <tr key={m.sessionLabel}><td>{m.sessionLabel}</td><td className="num">{m.participantMessages}</td><td className="num">{m.masked}</td><td className="num">{pct(m.ratio, 1)}</td><td className="num">{m.short}</td><td className="num">{m.longer}</td><td className="text-stone-500">{m.method}{m.seed !== null && m.method !== "none" ? ` (seed ${m.seed})` : ""}</td></tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          </div>
        )}
      </Section>

      <Section
        title="AI evaluation"
        description="How close the AI-written replacements came to what was actually said."
        actions={
          data.runs.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={data.selectedRunId ?? ""} onChange={(ev) => setParam("run", ev.target.value)} className="h-9 w-64">
                {data.runs.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.done}/{r.total})</option>)}
              </Select>
              <Select value={e?.source.key ?? ""} onChange={(ev) => setParam("source", ev.target.value)} className="h-9 w-64" disabled={!data.sources.length}>
                {data.sources.length === 0 && <option value="">No scores yet</option>}
                {data.sources.map((s) => <option key={s.key} value={s.key}>{s.label} ({s.count})</option>)}
              </Select>
            </div>
          )
        }
      >
        {!e ? (
          <Empty>No AI runs yet. <Link className="text-accent hover:underline" href="/admin/runs">Create one</Link> once sessions have gaps.</Empty>
        ) : (
          <Evaluation report={data} />
        )}
      </Section>

      <Section title="Draft text for the thesis" description="Generated from the numbers above. Edit before use; paraphrase any example message.">
        <div className="grid gap-6 lg:grid-cols-2">
          <TextBlock title="Method" text={data.methodsText} />
          <TextBlock title="Results" text={data.resultsText} />
        </div>
      </Section>
    </>
  );
}

function Evaluation({ report }: { report: ResultsReport }) {
  const e = report.evaluation!;
  const [showGaps, setShowGaps] = useState(false);
  if (e.nPredictions === 0) return <Notice>This run has no finished predictions yet. Open the run and press Run predictions.</Notice>;
  const short = e.byLength[0];
  const longer = e.byLength[1];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
        <span className="font-medium text-stone-900">{e.run.name}</span>
        <Badge>{e.run.model}</Badge>
        <Badge>effort {e.run.config.effort}</Badge>
        <Badge>{e.run.config.contextMode === "bidirectional" ? "both-sides context" : "preceding context only"}</Badge>
        <span>· {e.n} of {e.nPredictions} scored by <span className="font-medium">{e.source.label}</span></span>
      </div>

      {e.n === 0 ? (
        <Notice tone="warning">
          No scores for this run yet. <Link className="font-medium underline" href={`/admin/runs/${e.run.id}/score`}>Score the gaps</Link> or run the LLM judge from the{" "}
          <Link className="font-medium underline" href={`/admin/runs/${e.run.id}`}>run page</Link>. Automatic metrics and style comparisons below are already available.
        </Notice>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Mean score" value={`${num(e.summary.mean)} / 3`} hint={e.ci95 ? `95% CI ${num(e.ci95[0])}–${num(e.ci95[1])}` : `SD ${num(e.summary.sd)}`} />
            <Stat label="Meaning kept (≥2)" value={pct(e.shareAtLeast2)} />
            <Stat label="Full match (3)" value={pct(e.distribution.find((d) => d.score === 3)?.share)} />
            <Stat label="Failures (0–1)" value={pct(e.failures.share)} hint={`${e.failures.n} gaps`} />
            <Stat label="Short vs longer" value={`${num(short.mean, 2)} / ${num(longer.mean, 2)}`} hint={`${pText(e.lengthTest.p)} (Mann–Whitney)`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Score distribution" description={`Median ${num(e.summary.median, 1)}, IQR ${num(e.summary.q1, 1)}–${num(e.summary.q3, 1)}, SD ${num(e.summary.sd)}`}>
              <ColumnChart name="Gaps" data={[...e.distribution].reverse().map((d) => ({ label: `${d.score} · ${d.label.split(",")[0]}`, value: d.count }))} />
              <table className="data mt-3">
                <thead><tr><th>Score</th><th>Meaning</th><th className="num">n</th><th className="num">%</th></tr></thead>
                <tbody>{e.distribution.map((d) => <tr key={d.score}><td className="font-medium">{d.score}</td><td>{d.label}</td><td className="num">{d.count}</td><td className="num">{pct(d.share, 1)}</td></tr>)}</tbody>
              </table>
            </Card>
            <Card title="Mean score by message type" description={e.typeTest.statistic !== null ? `Kruskal–Wallis H = ${num(e.typeTest.statistic)}, df = ${e.typeTest.df}, ${pText(e.typeTest.p)}` : "Set message types while scoring to compare them."}>
              <HBarChart name="Mean score" domain={[0, 3]} format={(v) => v.toFixed(2)} data={e.byType.filter((g) => g.mean !== null).map((g) => ({ label: `${g.label} (n=${g.n})`, value: g.mean! }))} />
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <GroupTable title="Short reactions vs longer messages" rows={e.byLength} note={e.lengthTest.statistic !== null ? `Mann–Whitney U = ${num(e.lengthTest.statistic, 1)}, z = ${num(e.lengthTest.z)}, ${pText(e.lengthTest.p)}, r = ${num(e.lengthTest.effect)}${e.lengthTest.note ? ` — ${e.lengthTest.note}` : ""}` : undefined} />
            <GroupTable title="By conversation" rows={e.bySession} note={e.sessionTest.statistic !== null ? `Kruskal–Wallis H = ${num(e.sessionTest.statistic)}, df = ${e.sessionTest.df}, ${pText(e.sessionTest.p)}` : undefined} />
            <GroupTable title="By message type" rows={e.byType} />
            <GroupTable title="By position in the conversation" rows={e.byThird} note={`Spearman ρ (position vs score) = ${num(e.positionCorr.rho)}, ${pText(e.positionCorr.p)}; ρ (preceding context size vs score) = ${num(e.contextCorr.rho)}, ${pText(e.contextCorr.p)}`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="What went wrong" description={`Failure categories among the ${e.failures.n} gaps scoring 0–1${e.failures.untagged ? ` (${e.failures.untagged} untagged)` : ""}. A gap can have several.`}>
              {e.failures.n === 0 ? (
                <Empty>No failures under this score source.</Empty>
              ) : (
                <>
                  <HBarChart name="Failures" data={e.failures.tags.filter((t) => t.count > 0).sort((a, b) => b.count - a.count).map((t) => ({ label: t.label, value: t.count }))} />
                  <table className="data mt-3">
                    <thead><tr><th>Category</th><th className="num">n</th><th className="num">% of failures</th><th className="num">Short</th><th className="num">Longer</th></tr></thead>
                    <tbody>
                      {e.failures.tags.filter((t) => t.count > 0).map((t) => {
                        const b = e.failures.byLength.find((x) => x.id === t.id)!;
                        return <tr key={t.id}><td>{t.label}</td><td className="num">{t.count}</td><td className="num">{pct(t.shareOfFailures)}</td><td className="num">{b.short}</td><td className="num">{b.longer}</td></tr>;
                      })}
                    </tbody>
                  </table>
                </>
              )}
            </Card>
            <Card title="Do failures match how people spot AI text?" description="Failure categories grouped by the cue people report using.">
              <table className="data">
                <thead><tr><th>Cue</th><th>Evidence here</th><th className="num">Failures</th><th className="num">%</th></tr></thead>
                <tbody>
                  {e.cues.map((c) => (
                    <tr key={c.id}>
                      <td className="font-medium">{c.label}<div className="text-xs font-normal text-stone-500">{c.description}</div></td>
                      <td className="text-xs text-stone-600">
                        {c.tags.map(tagLabel).join(", ")}
                        {c.id === "shape" && <div className="mt-1">Length CV: AI {num(e.length.cvPred)} vs human {num(e.length.cvOrig)}</div>}
                        {c.id === "impersonal" && <div className="mt-1">First-person: AI {pct(e.style.find((s) => s.key === "firstPerson")?.ai)} vs human {pct(e.style.find((s) => s.key === "firstPerson")?.original)}</div>}
                        {c.id === "formality" && <div className="mt-1">Starts capitalised: AI {pct(e.style.find((s) => s.key === "startsCapital")?.ai)} vs human {pct(e.style.find((s) => s.key === "startsCapital")?.original)}</div>}
                      </td>
                      <td className="num">{c.count}</td>
                      <td className="num">{pct(c.share)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Length and shape" description="Word counts, original vs AI, on the same gaps.">
          <table className="data">
            <thead><tr><th></th><th className="num">Original</th><th className="num">AI</th></tr></thead>
            <tbody>
              <tr><td>Mean words</td><td className="num">{num(e.length.orig.mean, 2)}</td><td className="num">{num(e.length.pred.mean, 2)}</td></tr>
              <tr><td>SD</td><td className="num">{num(e.length.orig.sd, 2)}</td><td className="num">{num(e.length.pred.sd, 2)}</td></tr>
              <tr><td>Median (IQR)</td><td className="num">{num(e.length.orig.median, 1)} ({num(e.length.orig.q1, 1)}–{num(e.length.orig.q3, 1)})</td><td className="num">{num(e.length.pred.median, 1)} ({num(e.length.pred.q1, 1)}–{num(e.length.pred.q3, 1)})</td></tr>
              <tr><td>Coefficient of variation</td><td className="num">{num(e.length.cvOrig)}</td><td className="num">{num(e.length.cvPred)}</td></tr>
            </tbody>
          </table>
          <p className="mt-3 text-sm text-stone-600">
            Wilcoxon signed-rank T = {num(e.length.test.statistic, 1)}, {pText(e.length.test.p)}, d<sub>z</sub> = {num(e.length.dz)}. The AI was longer in {pct(e.length.shareLonger)}, shorter in {pct(e.length.shareShorter)}, and the same length in {pct(e.length.shareSame)} of gaps (median ratio {num(e.length.ratioMedian)}). {pct(e.length.shortOrigShareLongerPred)} of short reactions were replaced with something longer.
          </p>
        </Card>
        <Card title="Automatic similarity metrics" description="Mean over all gaps, and how well each tracks the rubric score (Spearman ρ).">
          <table className="data">
            <thead><tr><th>Metric</th><th className="num">Mean</th><th className="num">SD</th><th className="num">ρ with score</th><th className="num">p</th></tr></thead>
            <tbody>
              {e.metrics.map((m) => (
                <tr key={m.key}><td title={m.description}>{m.label}</td><td className="num">{num(m.summary.mean, 3)}</td><td className="num">{num(m.summary.sd, 3)}</td><td className="num">{num(m.corr.rho)}</td><td className="num">{pText(m.corr.p).replace(/^p = /, "").replace(/^p /, "")}</td></tr>
              ))}
            </tbody>
          </table>
          {e.n > 0 && (
            <>
              <h3 className="mb-1 mt-4 text-sm font-medium text-stone-700">Mean metric by rubric score</h3>
              <Scroll>
                <table className="data">
                  <thead><tr><th>Score</th><th className="num">n</th>{e.metrics.map((m) => <th key={m.key} className="num">{m.label}</th>)}</tr></thead>
                  <tbody>{e.metricsByScore.map((r) => <tr key={r.score}><td>{r.score}</td><td className="num">{r.n}</td>{e.metrics.map((m) => <td key={m.key} className="num">{num(r.values[m.key], 2)}</td>)}</tr>)}</tbody>
                </table>
              </Scroll>
            </>
          )}
        </Card>
      </div>

      <Card title="Style: original vs AI" description="Share of messages with each feature. 'All human' is every participant message in the run's sessions. p is an exact McNemar test on the paired gaps.">
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <PairedHBarChart aLabel="Original (human)" bLabel="AI" domain={[0, 1]} format={(v) => `${Math.round(v * 100)}%`} data={e.style.filter((s) => (s.original ?? 0) + (s.ai ?? 0) > 0).map((s) => ({ label: s.label, a: s.original ?? 0, b: s.ai ?? 0 }))} />
          <table className="data self-start">
            <thead><tr><th>Feature</th><th className="num">All human</th><th className="num">Original</th><th className="num">AI</th><th className="num">Diff</th><th className="num">p</th></tr></thead>
            <tbody>
              {e.style.map((s) => (
                <tr key={s.key}>
                  <td>{s.label}</td><td className="num text-stone-500">{pct(s.baseline)}</td><td className="num">{pct(s.original)}</td><td className="num">{pct(s.ai)}</td>
                  <td className={cx("num", s.diff !== null && Math.abs(s.diff) >= 0.15 && "font-semibold")}>{s.diff === null ? "–" : `${s.diff >= 0 ? "+" : ""}${Math.round(s.diff * 100)}`}</td>
                  <td className="num">{pText(s.p).replace(/^p = /, "").replace(/^p /, "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {e.agreement.length > 0 && (
        <Card title="Inter-rater agreement" description="Quadratic-weighted κ is the usual statistic for an ordinal 0–3 scale.">
          <table className="data">
            <thead><tr><th>Rater A</th><th>Rater B</th><th className="num">n</th><th className="num">Exact</th><th className="num">Within 1</th><th className="num">Cohen&apos;s κ</th><th className="num">Weighted κ</th></tr></thead>
            <tbody>{e.agreement.map((a) => <tr key={`${a.a}-${a.b}`}><td>{a.a}</td><td>{a.b}</td><td className="num">{a.n}</td><td className="num">{pct(a.exact)}</td><td className="num">{pct(a.withinOne)}</td><td className="num">{num(a.kappa)}</td><td className="num font-medium">{num(a.weightedKappa)}</td></tr>)}</tbody>
          </table>
        </Card>
      )}

      {report.comparisons.length > 0 && (
        <Card title="Compared with other runs" description="Paired on the same gaps (Wilcoxon signed-rank).">
          <Scroll>
            <table className="data">
              <thead><tr><th>Other run</th><th>What differs</th><th className="num">n</th><th className="num">Score (this)</th><th className="num">Score (other)</th><th className="num">p</th><th className="num">chrF (this)</th><th className="num">chrF (other)</th><th className="num">p</th></tr></thead>
              <tbody>
                {report.comparisons.map((c) => {
                  const chrf = c.metrics.find((m) => m.key === "chrF")!;
                  return (
                    <tr key={c.runId}>
                      <td className="font-medium">{c.name}</td><td className="max-w-xs text-xs text-stone-600">{c.configDiff.join("; ") || "–"}</td><td className="num">{c.nPaired}</td>
                      <td className="num">{num(c.scoreA)}</td><td className="num">{num(c.scoreB)}</td><td className="num">{c.scoreTest ? pText(c.scoreTest.p).replace(/^p = /, "") : "–"}</td>
                      <td className="num">{num(chrf.meanA, 3)}</td><td className="num">{num(chrf.meanB, 3)}</td><td className="num">{pText(chrf.test.p).replace(/^p = /, "")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Scroll>
        </Card>
      )}

      <Card title="Usage" description="Thinking tokens are counted as output.">
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <span>Input tokens <span className="font-medium tabular">{e.usage.inputTokens.toLocaleString()}</span></span>
          <span>Output tokens <span className="font-medium tabular">{e.usage.outputTokens.toLocaleString()}</span></span>
          <span>Mean latency <span className="font-medium">{seconds(e.usage.meanLatencyMs === null ? null : e.usage.meanLatencyMs / 1000)}</span></span>
          {e.usage.costUsd !== null && <span>Estimated cost <span className="font-medium">US${e.usage.costUsd.toFixed(2)}</span></span>}
        </div>
      </Card>

      <Card
        title={`All gaps (${e.gaps.length})`}
        description="Paraphrase before quoting any example in the thesis."
        actions={<Button size="sm" variant="secondary" onClick={() => setShowGaps(!showGaps)}>{showGaps ? "Hide" : "Show"}</Button>}
      >
        {showGaps && (
          <Scroll>
            <table className="data">
              <thead><tr><th>Session</th><th className="num">#</th><th>Type</th><th>Original</th><th>AI</th><th className="num">Score</th><th>Tags</th><th className="num">chrF</th></tr></thead>
              <tbody>
                {e.gaps.map((g) => (
                  <tr key={g.predictionId}>
                    <td className="whitespace-nowrap">{g.sessionLabel}</td><td className="num">{g.position}</td>
                    <td className="text-xs">{typeLabel(g.msgType)}<div className="text-stone-400">{g.lengthClass}</div></td>
                    <td className="max-w-xs whitespace-pre-wrap break-words">{g.original}</td><td className="max-w-xs whitespace-pre-wrap break-words">{g.predicted}</td>
                    <td className="num font-medium">{g.score === null ? "–" : num(g.score, g.score % 1 ? 1 : 0)}</td>
                    <td className="text-xs">{g.tags.map(tagLabel).join(", ")}</td>
                    <td className="num">{num(g.metrics.chrF)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroll>
        )}
      </Card>
    </div>
  );
}

function GroupTable({ title, rows, note }: { title: string; rows: GroupStat[]; note?: string }) {
  return (
    <Card title={title}>
      <table className="data">
        <thead><tr><th>Group</th><th className="num">n</th><th className="num">Mean</th><th className="num">SD</th><th className="num">3</th><th className="num">2</th><th className="num">1</th><th className="num">0</th></tr></thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.key}><td>{g.label}</td><td className="num">{g.n}</td><td className="num font-medium">{num(g.mean)}</td><td className="num">{num(g.sd)}</td><td className="num">{g.dist[3]}</td><td className="num">{g.dist[2]}</td><td className="num">{g.dist[1]}</td><td className="num">{g.dist[0]}</td></tr>
          ))}
        </tbody>
      </table>
      {note && <p className="mt-3 text-xs text-stone-500">{note}</p>}
    </Card>
  );
}

function Section({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && <p className="text-sm text-stone-500">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Scroll({ children }: { children: ReactNode }) {
  return <div className="-mx-5 overflow-x-auto px-0">{children}</div>;
}

function TextBlock({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Card
      title={title}
      actions={<Button size="sm" variant="secondary" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy"}</Button>}
    >
      <div className="space-y-3 text-sm leading-relaxed text-stone-700">
        {text.split("\n\n").map((p, i) => <p key={i}>{p}</p>)}
      </div>
    </Card>
  );
}

function ExportMenu({ exportUrl }: { exportUrl: (kind: string) => string }) {
  const items = [
    ["markdown", "Full report (Markdown tables)"],
    ["predictions", "Gaps & scores (CSV)"],
    ["sessions", "Session records (CSV)"],
    ["transcripts", "Transcripts, P-labels (CSV)"],
    ["json", "Everything (JSON)"],
  ];
  return (
    <details className="relative">
      <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-lg bg-accent px-3 text-sm font-medium text-white hover:bg-accent-strong">Export ▾</summary>
      <div className="absolute right-0 z-10 mt-1 w-64 rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
        {items.map(([kind, label]) => (
          <a key={kind} href={exportUrl(kind)} className="block px-3 py-2 text-sm text-stone-700 hover:bg-stone-50">{label}</a>
        ))}
      </div>
    </details>
  );
}
