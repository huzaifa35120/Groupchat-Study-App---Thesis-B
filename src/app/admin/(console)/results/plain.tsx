"use client";
// Plain-language results: everything here is a count, a share or an average
// read straight off the gap table.
import { useMemo, useState } from "react";
import { Badge, Card, Empty, Select, cx } from "@/components/ui";
import type { Evaluation, GapExample, GapRow, PlainGroup } from "@/lib/analysis/report";
import { FAILURE_TAGS, tagLabel, typeLabel } from "@/lib/constants";
import { num, pct } from "@/lib/format";

// Ordinal ramp (one hue, light -> dark) for scores 0..3
const SCORE_COLOR = ["#86b6ef", "#5598e7", "#2a78d6", "#184f95"];
const SCORE_TEXT = ["#0d366b", "#ffffff", "#ffffff", "#ffffff"];

function ScoreChip({ score }: { score: number | null }) {
  if (score === null) return <span className="text-stone-400">–</span>;
  const r = Math.round(score);
  return (
    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-semibold tabular" style={{ background: SCORE_COLOR[r], color: SCORE_TEXT[r] }}>
      {score % 1 ? score.toFixed(1) : score}
    </span>
  );
}

export function AtAGlance({ e }: { e: Evaluation }) {
  const p = e.plain;
  return (
    <div className="space-y-4">
      <Card title="Key findings" description={`Plain-English summary of the ${p.scored} scored gaps (${e.source.label}).`}>
        {p.findings.length === 0 ? (
          <Empty>Score some gaps to see findings.</Empty>
        ) : (
          <ul className="space-y-2 text-[15px] leading-relaxed text-stone-800">
            {p.findings.map((f, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {p.scored > 0 && (
        <Card title="How close did the AI get?" description="Every scored gap falls into one of four outcomes.">
          <div className="flex h-9 w-full overflow-hidden rounded-lg" role="img" aria-label="Share of gaps per outcome">
            {[...p.outcomes].map((o) =>
              o.count ? (
                <div
                  key={o.score}
                  title={`${o.title}: ${o.count}`}
                  className="flex items-center justify-center border-r-2 border-white text-xs font-semibold last:border-r-0"
                  style={{ width: `${(o.share ?? 0) * 100}%`, background: SCORE_COLOR[o.score], color: SCORE_TEXT[o.score] }}
                >
                  {(o.share ?? 0) >= 0.08 && pct(o.share)}
                </div>
              ) : null,
            )}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {p.outcomes.map((o) => (
              <div key={o.score} className="rounded-lg border border-stone-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <ScoreChip score={o.score} />
                  <span className="text-sm font-medium text-stone-900">{o.title}</span>
                </div>
                <div className="mt-2 text-2xl font-semibold tabular text-stone-900">
                  {o.count}
                  <span className="ml-1.5 text-sm font-normal text-stone-500">of {p.scored} ({pct(o.share)})</span>
                </div>
                <div className="mt-0.5 text-xs text-stone-500">{o.description}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

export function PlainGroupTable({ title, description, rows }: { title: string; description?: string; rows: PlainGroup[] }) {
  return (
    <Card title={title} description={description}>
      {rows.length === 0 ? (
        <Empty>Nothing scored yet.</Empty>
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th></th>
                <th className="num">Gaps</th>
                <th className="num">Avg score</th>
                <th className="num">Meaning kept</th>
                <th className="num">Nailed it</th>
                <th className="num">Didn&apos;t fit</th>
                <th>Most common problem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.key}>
                  <td className="font-medium">{g.label}</td>
                  <td className="num">{g.n}</td>
                  <td className="num"><ScoreChip score={g.avg === null ? null : Math.round(g.avg * 10) / 10} /></td>
                  <td className="num">{g.meaningKept} <span className="text-stone-400">({pct(g.n ? g.meaningKept / g.n : null)})</span></td>
                  <td className="num">{g.fullMatch}</td>
                  <td className="num">{g.noFit}</td>
                  <td className="text-stone-600">{g.topProblem ? `${g.topProblem.label} (${g.topProblem.count})` : <span className="text-stone-400">none</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function heat(count: number, max: number) {
  if (!count) return { background: "transparent", color: "#a8a29e" };
  const t = 0.15 + 0.85 * (count / Math.max(1, max));
  return { background: `rgba(42, 120, 214, ${t.toFixed(2)})`, color: t > 0.55 ? "#ffffff" : "#0d366b" };
}

export function Grids({ e }: { e: Evaluation }) {
  const p = e.plain;
  const scoreMax = Math.max(1, ...p.typeScore.flatMap((r) => r.counts));
  const probMax = Math.max(1, ...p.typeProblem.cells.flat());
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Scores by message type" description="How many gaps of each type got each score. Darker = more gaps.">
        {p.typeScore.length === 0 ? (
          <Empty>Nothing scored yet.</Empty>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Type</th>
                {[3, 2, 1, 0].map((sc) => <th key={sc} className="num">{sc}</th>)}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {p.typeScore.map((r) => (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  {[3, 2, 1, 0].map((sc) => (
                    <td key={sc} className="num p-1!">
                      <span className="block rounded px-2 py-1 font-medium tabular" style={heat(r.counts[sc], scoreMax)}>{r.counts[sc]}</span>
                    </td>
                  ))}
                  <td className="num font-medium">{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card title="Problems by message type" description="Which problems show up for which kinds of message. A gap can have several problems.">
        {p.typeProblem.problems.length === 0 ? (
          <Empty>No problems tagged yet.</Empty>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Type</th>
                  {p.typeProblem.problems.map((pr) => <th key={pr.id} className="num whitespace-normal! normal-case! tracking-normal! text-[11px]!">{pr.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {p.typeProblem.types.map((t, i) => (
                  <tr key={t.key}>
                    <td className="whitespace-nowrap">{t.label}</td>
                    {p.typeProblem.cells[i].map((c, j) => (
                      <td key={j} className="num p-1!">
                        <span className="block rounded px-2 py-1 font-medium tabular" style={heat(c, probMax)}>{c}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ExampleLine({ ex }: { ex: GapExample }) {
  return (
    <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
        <ScoreChip score={ex.score} />
        <span>{ex.sessionLabel} · #{ex.position} · {ex.type}</span>
      </div>
      <div className="mt-1.5 grid gap-1 sm:grid-cols-[64px_1fr]">
        <span className="text-xs font-medium uppercase tracking-wide text-stone-400">Real</span>
        <span className="text-stone-900">{ex.original}</span>
        <span className="text-xs font-medium uppercase tracking-wide text-stone-400">AI</span>
        <span className="text-stone-900">{ex.predicted}</span>
      </div>
    </div>
  );
}

export function Problems({ e }: { e: Evaluation }) {
  const p = e.plain;
  return (
    <Card title="What went wrong" description="Each problem, how often it happened, which message types it hit most, and a real example.">
      {p.problems.length === 0 ? (
        <Empty>No problems tagged yet. Problems come from your tags (or the LLM judge&apos;s) when scoring.</Empty>
      ) : (
        <div className="space-y-4">
          {p.problems.map((pr) => (
            <div key={pr.id} className="grid gap-3 border-b border-stone-100 pb-4 last:border-b-0 last:pb-0 md:grid-cols-[260px_1fr]">
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-stone-900">{pr.label}</span>
                  <span className="text-sm tabular text-stone-600">{pr.count} gap{pr.count === 1 ? "" : "s"} · {pct(pr.share)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                  <div className="h-full rounded-full" style={{ width: `${(pr.share ?? 0) * 100}%`, background: SCORE_COLOR[2] }} />
                </div>
                <p className="mt-2 text-xs text-stone-500">{pr.description}</p>
                {pr.types.length > 0 && <p className="mt-1 text-xs text-stone-600">Mostly in: {pr.types.join(", ")}</p>}
              </div>
              {pr.example && <ExampleLine ex={pr.example} />}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function BestWorst({ e }: { e: Evaluation }) {
  const p = e.plain;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Closest matches" description="Highest-scoring gaps.">
        {p.best.length === 0 ? <Empty>No gaps scored 2 or 3 yet.</Empty> : <div className="space-y-2">{p.best.map((ex, i) => <ExampleLine key={i} ex={ex} />)}</div>}
      </Card>
      <Card title="Biggest misses" description="Lowest-scoring gaps.">
        {p.worst.length === 0 ? <Empty>No gaps scored 0 or 1 yet.</Empty> : <div className="space-y-2">{p.worst.map((ex, i) => <ExampleLine key={i} ex={ex} />)}</div>}
      </Card>
    </div>
  );
}

export function LengthStyle({ e }: { e: Evaluation }) {
  const L = e.plain.length;
  return (
    <Card title="How the AI writes differently" description="Length and style of the AI's replies compared with the real messages they replaced.">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2 text-sm text-stone-700">
          <div className="flex justify-between"><span>Average length, real messages</span><span className="font-medium tabular">{num(L.origAvg, 1)} words</span></div>
          <div className="flex justify-between"><span>Average length, AI replies</span><span className="font-medium tabular">{num(L.aiAvg, 1)} words</span></div>
          <div className="flex justify-between"><span>AI wrote more</span><span className="font-medium tabular">{L.longer} of {L.total}</span></div>
          <div className="flex justify-between"><span>AI wrote less</span><span className="font-medium tabular">{L.shorter} of {L.total}</span></div>
          <div className="flex justify-between"><span>Same length</span><span className="font-medium tabular">{L.same} of {L.total}</span></div>
        </div>
        <div className="space-y-2 text-sm text-stone-700">
          {e.plain.style.length === 0 ? (
            <p className="text-stone-500">No big style differences (15 points or more) between the real and AI messages.</p>
          ) : (
            e.plain.style.map((s) => (
              <div key={s.label}>
                <div className="font-medium text-stone-800">{s.label}</div>
                <div className="text-stone-600">Real messages {pct(s.original)} · AI {pct(s.ai)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}

function raterName(rater: string) {
  return rater.startsWith("llm:") ? "LLM" : rater.split("@")[0];
}

export function GapExplorer({ gaps }: { gaps: GapRow[] }) {
  const [type, setType] = useState("");
  const [score, setScore] = useState("");
  const [problem, setProblem] = useState("");
  const [sort, setSort] = useState("session");

  const types = useMemo(() => [...new Set(gaps.map((g) => g.msgType ?? ""))], [gaps]);
  const raters = useMemo(() => [...new Set(gaps.flatMap((g) => Object.keys(g.raterScores)))].sort((a, b) => (a.startsWith("llm:") ? 1 : 0) - (b.startsWith("llm:") ? 1 : 0)), [gaps]);
  const rows = useMemo(() => {
    const filtered = gaps.filter(
      (g) =>
        (!type || (g.msgType ?? "") === type) &&
        (score === "" || (g.scoreRounded !== null && String(g.scoreRounded) === score)) &&
        (!problem || g.tags.includes(problem)),
    );
    if (sort === "low") return [...filtered].sort((a, b) => (a.score ?? 9) - (b.score ?? 9));
    if (sort === "high") return [...filtered].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    return filtered;
  }, [gaps, type, score, problem, sort]);

  return (
    <Card title={`All gaps (${gaps.length})`} description="Filter and sort. Paraphrase any example before quoting it in the thesis.">
      <div className="mb-4 grid grid-cols-2 items-center gap-2 md:grid-cols-[repeat(4,minmax(0,200px))_auto]">
        <Select value={type} onChange={(e) => setType(e.target.value)} className="h-9">
          <option value="">All types</option>
          {types.map((t) => <option key={t} value={t}>{typeLabel(t || null)}</option>)}
        </Select>
        <Select value={score} onChange={(e) => setScore(e.target.value)} className="h-9">
          <option value="">All scores</option>
          {[3, 2, 1, 0].map((s) => <option key={s} value={s}>Score {s}</option>)}
        </Select>
        <Select value={problem} onChange={(e) => setProblem(e.target.value)} className="h-9">
          <option value="">All problems</option>
          {FAILURE_TAGS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value)} className="h-9">
          <option value="session">Conversation order</option>
          <option value="low">Lowest score first</option>
          <option value="high">Highest score first</option>
        </Select>
        <span className="text-sm text-stone-500">{rows.length} shown</span>
      </div>
      {rows.length === 0 ? (
        <Empty>No gaps match these filters.</Empty>
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Session</th>
                <th className="num">#</th>
                <th>Type</th>
                <th>Real message</th>
                <th>AI reply</th>
                <th className="num">Score</th>
                {raters.length > 1 && <th>Scores</th>}
                <th>Problems</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.predictionId}>
                  <td className="whitespace-nowrap">{g.sessionLabel}</td>
                  <td className="num">{g.position}</td>
                  <td className="text-xs">
                    {typeLabel(g.msgType)}
                    <div className="text-stone-400">{g.lengthClass === "short" ? "short" : "longer"}</div>
                  </td>
                  <td className="max-w-xs whitespace-pre-wrap break-words">{g.original}</td>
                  <td className="max-w-xs whitespace-pre-wrap break-words">{g.predicted}</td>
                  <td className="num"><ScoreChip score={g.score} /></td>
                  {raters.length > 1 && (
                    <td className="whitespace-nowrap text-xs text-stone-600">
                      {raters.map((r) => (
                        <div key={r}>{raterName(r)}: <span className="font-medium">{g.raterScores[r] ?? "–"}</span></div>
                      ))}
                    </td>
                  )}
                  <td className="text-xs">
                    <div className="flex max-w-48 flex-wrap gap-1">
                      {g.tags.map((t) => <Badge key={t} tone="red">{tagLabel(t)}</Badge>)}
                    </div>
                  </td>
                  <td className={cx("max-w-sm text-xs text-stone-600")}>{g.notes ?? (g.llmReason ? <span><span className="text-stone-400">LLM: </span>{g.llmReason}</span> : "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

