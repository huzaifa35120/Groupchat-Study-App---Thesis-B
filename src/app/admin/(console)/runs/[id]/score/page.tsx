"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Checkbox, Notice, Select, Spinner, Textarea, cx } from "@/components/ui";
import type { RunDetail, RunPrediction } from "@/lib/admin-types";
import { api, errorText, useApi } from "@/lib/client";
import { FAILURE_TAGS, MSG_TYPES, RUBRIC, tagLabel, typeLabel } from "@/lib/constants";
import type { MessageRow } from "@/lib/types";

type SessionMessages = (MessageRow & { speaker: string | null })[];

export default function ScorePage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useApi<RunDetail>(`/api/admin/runs/${id}`);
  const [index, setIndex] = useState(0);
  const [onlyUnscored, setOnlyUnscored] = useState(false);
  const [showJudge, setShowJudge] = useState(false);
  const [transcripts, setTranscripts] = useState<Record<string, SessionMessages>>({});

  const gaps = useMemo(() => (data?.predictions ?? []).filter((p) => p.status === "done"), [data]);
  const visible = useMemo(
    () => (onlyUnscored && data ? gaps.filter((p) => !p.scores.some((s) => s.rater === data.me)) : gaps),
    [gaps, onlyUnscored, data],
  );
  const current = visible[Math.min(index, Math.max(0, visible.length - 1))];

  useEffect(() => {
    if (!current || transcripts[current.session_id]) return;
    void api<{ messages: SessionMessages }>(`/api/admin/sessions/${current.session_id}`).then((res) =>
      setTranscripts((t) => ({ ...t, [current.session_id]: res.messages })),
    );
  }, [current, transcripts]);

  if (error && !data) return <Notice tone="error">{error}</Notice>;
  if (!data) return <div className="flex items-center gap-2 text-sm text-stone-500"><Spinner /> Loading…</div>;

  const scoredByMe = gaps.filter((p) => p.scores.some((s) => s.rater === data.me)).length;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/admin/runs/${id}`} className="text-sm text-stone-500 hover:text-stone-800">← {data.run.name}</Link>
          <h1 className="text-xl font-semibold tracking-tight">Score gaps</h1>
          <p className="text-sm text-stone-500">Scoring as {data.me} · {scoredByMe}/{gaps.length} done</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Checkbox label="Unscored only" checked={onlyUnscored} onChange={(v) => { setOnlyUnscored(v); setIndex(0); }} />
          <Checkbox label="Show LLM judge" hint="Off avoids anchoring" checked={showJudge} onChange={setShowJudge} />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1">
        {visible.map((p, i) => {
          const done = p.scores.some((s) => s.rater === data.me);
          return (
            <button
              key={p.id}
              onClick={() => setIndex(i)}
              title={`${p.sessionLabel} #${p.position_index + 1}`}
              className={cx("h-6 w-6 rounded text-[10px] font-medium", i === index ? "ring-2 ring-accent ring-offset-1" : "", done ? "bg-accent text-white" : "bg-stone-200 text-stone-600")}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {!current ? (
        <Notice tone="success">{onlyUnscored ? "Everything is scored." : "No predictions to score yet."}</Notice>
      ) : (
        <ScoreForm
          key={current.id}
          gap={current}
          me={data.me}
          transcript={transcripts[current.session_id]}
          showJudge={showJudge}
          onSaved={async () => {
            await reload();
            if (!onlyUnscored) setIndex((i) => Math.min(i + 1, visible.length - 1));
          }}
          onPrev={() => setIndex((i) => Math.max(0, i - 1))}
          onNext={() => setIndex((i) => Math.min(visible.length - 1, i + 1))}
        />
      )}
    </div>
  );
}

function ScoreForm({
  gap,
  me,
  transcript,
  showJudge,
  onSaved,
  onPrev,
  onNext,
}: {
  gap: RunPrediction;
  me: string;
  transcript?: SessionMessages;
  showJudge: boolean;
  onSaved: () => Promise<void>;
  onPrev: () => void;
  onNext: () => void;
}) {
  const own = gap.scores.find((s) => s.rater === me);
  const llm = gap.scores.find((s) => s.rater_type === "llm");
  const [score, setScore] = useState<number | null>(own?.score ?? null);
  const [tags, setTags] = useState<string[]>(own?.failure_tags ?? []);
  const [msgType, setMsgType] = useState<string>(own?.msg_type ?? gap.msgType ?? "");
  const [notes, setNotes] = useState(own?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = useCallback(async () => {
    if (score === null) return;
    setBusy(true);
    setErr(null);
    try {
      await api("/api/admin/scores", { body: { predictionId: gap.id, score, failureTags: tags, msgType: msgType || null, notes } });
      await onSaved();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }, [gap.id, score, tags, msgType, notes, onSaved]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.tagName === "SELECT") return;
      if (["0", "1", "2", "3"].includes(e.key)) setScore(Number(e.key));
      else if (e.key === "Enter") void save();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, onPrev, onNext]);

  const context = useMemo(() => {
    if (!transcript) return null;
    const i = transcript.findIndex((m) => m.id === gap.message_id);
    if (i < 0) return null;
    return { before: transcript.slice(Math.max(0, i - 8), i), after: transcript.slice(i + 1, i + 6) };
  }, [transcript, gap.message_id]);

  const line = (m: SessionMessages[number]) => (
    <div key={m.id} className={cx("flex gap-2 py-0.5 text-sm", m.is_operator && "text-amber-800")}>
      <span className="w-20 shrink-0 truncate text-right text-xs leading-5 text-stone-400">{m.is_operator ? "Moderator" : `${m.author_label}`}</span>
      <span className={cx("whitespace-pre-wrap break-words", m.is_masked && "text-stone-500")}>{m.body}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-stone-200 bg-white px-5 py-4">
        <div className="mb-2 flex items-center justify-between text-xs text-stone-500">
          <span>{gap.sessionLabel} · message #{gap.position_index + 1} · {gap.speaker}</span>
          <span>{typeLabel(gap.msgType)}</span>
        </div>
        {!context ? (
          <div className="flex items-center gap-2 text-sm text-stone-500"><Spinner /> Loading context…</div>
        ) : (
          <>
            {context.before.map(line)}
            <div className="my-1 flex gap-2 rounded-md bg-amber-100/70 py-1 text-sm">
              <span className="w-20 shrink-0 text-right text-xs leading-5 font-medium text-amber-800">GAP</span>
              <span className="text-amber-900">— {transcript?.find((m) => m.id === gap.message_id)?.author_label} —</span>
            </div>
            {context.after.map(line)}
          </>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-white px-5 py-4">
          <div className="text-xs font-medium uppercase tracking-wide text-stone-500">Original</div>
          <p className="mt-1 whitespace-pre-wrap break-words text-lg text-stone-900">{gap.original_text}</p>
        </div>
        <div className="rounded-xl border-2 border-accent/30 bg-accent-soft/50 px-5 py-4">
          <div className="text-xs font-medium uppercase tracking-wide text-accent-strong">AI ({gap.model})</div>
          <p className="mt-1 whitespace-pre-wrap break-words text-lg text-stone-900">{gap.predicted_text}</p>
        </div>
      </div>

      {showJudge && llm && (
        <Notice>
          <span className="font-medium">LLM judge: {llm.score}</span> — {llm.notes}{" "}
          {llm.failure_tags.length > 0 && <span className="text-stone-500">({llm.failure_tags.map(tagLabel).join(", ")})</span>}
        </Notice>
      )}

      <div className="rounded-xl border border-stone-200 bg-white px-5 py-4">
        <div className="grid gap-2 sm:grid-cols-4">
          {RUBRIC.map((r) => (
            <button
              key={r.score}
              onClick={() => setScore(r.score)}
              className={cx(
                "rounded-lg border px-3 py-3 text-left transition-colors",
                score === r.score ? "border-accent bg-accent text-white" : "border-stone-200 hover:border-stone-400",
              )}
            >
              <span className="block text-2xl font-semibold">{r.score}</span>
              <span className={cx("block text-xs", score === r.score ? "text-white/85" : "text-stone-500")}>{r.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-4">
          <div className="mb-2 text-sm font-medium text-stone-700">
            What went wrong? {score !== null && score <= 1 ? <Badge tone="amber">tag at least one for 0–1</Badge> : <span className="font-normal text-stone-400">(optional above 1)</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FAILURE_TAGS.map((t) => {
              const on = tags.includes(t.id);
              return (
                <button
                  key={t.id}
                  title={t.description}
                  onClick={() => setTags(on ? tags.filter((x) => x !== t.id) : [...tags, t.id])}
                  className={cx("rounded-full border px-3 py-1 text-xs", on ? "border-red-300 bg-red-50 text-red-800" : "border-stone-200 text-stone-600 hover:border-stone-400")}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr]">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-stone-700">Message type (original)</span>
            <Select value={msgType} onChange={(e) => setMsgType(e.target.value)}>
              <option value="">Unclassified</option>
              {MSG_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-stone-700">Notes</span>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What went wrong, in your words" />
          </label>
        </div>

        {err && <div className="mt-3"><Notice tone="error">{err}</Notice></div>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onPrev}>← Prev</Button>
            <Button variant="ghost" size="sm" onClick={onNext}>Next →</Button>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-stone-400 sm:inline">Keys: 0–3 score · Enter save · ←/→ move</span>
            <Button busy={busy} disabled={score === null || (score <= 1 && tags.length === 0)} onClick={() => void save()}>
              {own ? "Update & next" : "Save & next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
