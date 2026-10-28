"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Badge, Button, Card, Notice, PageHeader, Select, Spinner, StatusBadge, cx } from "@/components/ui";
import type { RunDetail, RunPrediction } from "@/lib/admin-types";
import { api, errorText, useApi } from "@/lib/client";
import { DEFAULT_MODEL, EFFORT_LEVELS, tagLabel } from "@/lib/constants";
import { num } from "@/lib/format";
import type { ScoreRow } from "@/lib/types";

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, reload } = useApi<RunDetail>(`/api/admin/runs/${id}`);
  const [running, setRunning] = useState<"predict" | "judge" | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [judgeEffort, setJudgeEffort] = useState<(typeof EFFORT_LEVELS)[number]>("high");
  const [judgeProgress, setJudgeProgress] = useState<{ remaining: number; total: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const stop = useRef(false);

  const addLog = (line: string) => setLog((l) => [`${new Date().toLocaleTimeString()}  ${line}`, ...l].slice(0, 50));

  const runPredictions = async () => {
    setRunning("predict");
    stop.current = false;
    try {
      for (;;) {
        const res = await api<{ processed: { ok: boolean; error?: string }[]; progress: RunDetail["progress"] }>(`/api/admin/runs/${id}/step`, { body: { batch: 3 } });
        res.processed.filter((p) => !p.ok).forEach((p) => addLog(`Error: ${p.error}`));
        addLog(`${res.progress.done}/${res.progress.total} done, ${res.progress.pending} pending, ${res.progress.errors} errors`);
        await reload();
        if (res.progress.pending === 0 || stop.current) break;
        if (res.processed.length === 0) await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (e) {
      addLog(`Stopped: ${errorText(e)}`);
    } finally {
      setRunning(null);
    }
  };

  const runJudge = async (redo = false) => {
    if (redo && !confirm("Delete the existing LLM-judge scores for this run and judge again?")) return;
    setRunning("judge");
    stop.current = false;
    let first = true;
    try {
      for (;;) {
        const res = await api<{ processed: { ok: boolean; error?: string }[]; remaining: number; total: number }>(`/api/admin/runs/${id}/judge`, {
          body: { batch: 3, effort: judgeEffort, model: DEFAULT_MODEL, redo: redo && first },
        });
        first = false;
        setJudgeProgress({ remaining: res.remaining, total: res.total });
        res.processed.filter((p) => !p.ok).forEach((p) => addLog(`Judge error: ${p.error}`));
        await reload();
        if (res.remaining === 0 || stop.current) break;
        if (res.processed.length > 0 && res.processed.every((p) => !p.ok)) {
          addLog("Judge stopped: every request in the last batch failed.");
          break;
        }
      }
    } catch (e) {
      addLog(`Judge stopped: ${errorText(e)}`);
    } finally {
      setRunning(null);
    }
  };

  if (error && !data) return <Notice tone="error">{error}</Notice>;
  if (!data) return <div className="flex items-center gap-2 text-sm text-stone-500"><Spinner /> Loading…</div>;

  const { run, progress, predictions } = data;
  const llmRater = `llm:${DEFAULT_MODEL}`;
  const judged = predictions.filter((p) => p.scores.some((s) => s.rater_type === "llm")).length;
  const mine = predictions.filter((p) => p.scores.some((s) => s.rater === data.me)).length;
  const pctDone = progress.total ? (progress.done / progress.total) * 100 : 0;

  return (
    <>
      <PageHeader
        back={<Link href="/admin/runs" className="text-stone-500 hover:text-stone-800">← AI runs</Link>}
        title={<span className="flex items-center gap-3">{run.name} <StatusBadge status={run.status} /></span>}
        description={<span className="font-mono">{run.model} · effort {run.config.effort} · {run.config.contextMode} · prompt {run.config.promptVersion}</span>}
        actions={
          <>
            <Link href={`/admin/runs/${id}/score`}><Button variant="secondary" disabled={!progress.done}>Score gaps ({mine}/{progress.done})</Button></Link>
            <Link href={`/admin/results?run=${id}`}><Button variant="secondary">Results</Button></Link>
            <Button variant="ghost" size="sm" onClick={async () => { if (confirm("Delete this run with all its predictions and scores?")) { await api(`/api/admin/runs/${id}`, { method: "DELETE" }); router.push("/admin/runs"); } }}>Delete</Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="1. Predict the gaps" description="Each gap is sent on its own; the model never sees the original.">
          <div className="h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full bg-accent transition-all" style={{ width: `${pctDone}%` }} /></div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Badge>{progress.done}/{progress.total} done</Badge>
            {progress.pending > 0 && <Badge tone="amber">{progress.pending} pending</Badge>}
            {progress.errors > 0 && <Badge tone="red">{progress.errors} errors</Badge>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {running === "predict" ? (
              <Button variant="secondary" onClick={() => { stop.current = true; }}><Spinner /> Running… stop after this batch</Button>
            ) : (
              <Button disabled={progress.pending === 0 || running !== null} onClick={() => void runPredictions()}>{progress.done ? "Continue" : "Run predictions"}</Button>
            )}
            {progress.errors > 0 && !running && (
              <Button variant="secondary" onClick={async () => { await api(`/api/admin/runs/${id}/retry`, { method: "POST" }); await reload(); }}>Retry failed</Button>
            )}
          </div>
          <p className="mt-3 text-xs text-stone-500">Keep this tab open while it runs. If you close it, press Continue later — finished gaps are kept.</p>
        </Card>

        <Card title="2. LLM judge (secondary rater)" description="Opus 5 applies the same 0–3 rubric so agreement with your scores can be reported.">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="mb-1 block text-stone-600">Effort</span>
              <Select value={judgeEffort} onChange={(e) => setJudgeEffort(e.target.value as typeof judgeEffort)} className="w-28">
                {EFFORT_LEVELS.map((l) => <option key={l}>{l}</option>)}
              </Select>
            </label>
            {running === "judge" ? (
              <Button variant="secondary" onClick={() => { stop.current = true; }}><Spinner /> Judging… stop</Button>
            ) : (
              <>
                <Button disabled={!progress.done || judged >= progress.done || running !== null} onClick={() => void runJudge()}>{judged ? "Judge remaining" : "Judge all"}</Button>
                {judged > 0 && <Button variant="ghost" size="sm" disabled={running !== null} onClick={() => void runJudge(true)}>Redo</Button>}
              </>
            )}
          </div>
          <p className="mt-3 text-sm text-stone-600">{judged}/{progress.done} judged{judgeProgress && running === "judge" ? ` · ${judgeProgress.remaining} to go` : ""}</p>
        </Card>
      </div>

      {log.length > 0 && (
        <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-stone-900 px-4 py-3 text-xs leading-relaxed text-stone-200">{log.join("\n")}</pre>
      )}

      <Card className="mt-6" title="Gaps" description="Original vs AI. Click a row to see the exact prompt.">
        <div className="-mx-5 overflow-x-auto">
          <table className="data">
            <thead>
              <tr><th>Session</th><th className="num">#</th><th>Speaker</th><th>Original</th><th>AI</th><th className="num">chrF</th><th className="num">LLM</th><th className="num">You</th><th>Status</th></tr>
            </thead>
            <tbody>
              {predictions.map((p) => {
                const llm = p.scores.find((s) => s.rater === llmRater) ?? p.scores.find((s) => s.rater_type === "llm");
                const own = p.scores.find((s) => s.rater === data.me);
                return (
                  <FragmentRow key={p.id} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} p={p} llm={llm} own={own} />
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function FragmentRow({ p, llm, own, open, onToggle }: { p: RunPrediction; llm?: ScoreRow; own?: ScoreRow; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr onClick={onToggle} className={cx("cursor-pointer hover:bg-stone-50", open && "bg-stone-50")}>
        <td className="whitespace-nowrap">{p.sessionLabel}</td>
        <td className="num">{p.position_index + 1}</td>
        <td className="font-mono text-xs">{p.speaker}</td>
        <td className="max-w-xs whitespace-pre-wrap break-words">{p.original_text}</td>
        <td className="max-w-xs whitespace-pre-wrap break-words">{p.predicted_text ?? <span className="text-stone-400">–</span>}</td>
        <td className="num">{num(p.metrics?.chrF ?? null)}</td>
        <td className="num">{llm ? llm.score : "–"}</td>
        <td className="num font-medium">{own ? own.score : "–"}</td>
        <td>{p.status === "done" ? <Badge tone="green">done</Badge> : p.status === "error" ? <Badge tone="red">error</Badge> : <Badge tone="amber">pending</Badge>}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={9} className="bg-stone-50">
            {p.error && <div className="mb-2"><Notice tone="error">{p.error}</Notice></div>}
            {llm && (
              <p className="mb-2 text-sm text-stone-700">
                <span className="font-medium">LLM judge:</span> {llm.notes}{" "}
                {llm.failure_tags.length > 0 && <span className="text-stone-500">({llm.failure_tags.map(tagLabel).join(", ")})</span>}
              </p>
            )}
            {p.metrics && (
              <p className="mb-2 text-xs text-stone-500">
                Token F1 {num(p.metrics.tokenF1)} · BLEU {num(p.metrics.bleu)} · ROUGE-L {num(p.metrics.rougeL)} · chrF {num(p.metrics.chrF)} · edit sim {num(p.metrics.editSimilarity)} · words {p.metrics.origWords}→{p.metrics.predWords}
                {p.input_tokens !== null && <> · {p.input_tokens} in / {p.output_tokens} out tokens · {num((p.latency_ms ?? 0) / 1000, 1)} s · {p.model}</>}
              </p>
            )}
            {p.prompt && <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-stone-200 bg-white p-3 text-xs text-stone-700">{p.prompt}</pre>}
          </td>
        </tr>
      )}
    </>
  );
}
