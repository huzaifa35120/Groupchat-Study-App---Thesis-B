"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatTranscript, Composer, Countdown, TypingLine, type ChatMessage } from "@/components/chat";
import { Badge, Button, Card, Checkbox, Field, Input, Notice, PageHeader, Spinner, Stat, StatusBadge, cx } from "@/components/ui";
import type { SessionStats } from "@/lib/analysis/session-stats";
import { api, errorText, newClientId, useApi } from "@/lib/client";
import { MSG_TYPES } from "@/lib/constants";
import { num, pct, seconds } from "@/lib/format";
import { DEFAULT_MASK_OPTIONS } from "@/lib/masking";
import type { MaskConfig, MessageRow, SessionRow } from "@/lib/types";
import { useRoom } from "@/lib/use-room";

type AdminMessage = MessageRow & { seq: number | null; speaker: string | null; words: number; lengthClass: "short" | "longer" };

interface SessionDetail {
  session: SessionRow;
  group: { id: string; name: string; code: string };
  participants: { id: string; pseudonym: string; label: string }[];
  messages: AdminMessage[];
  maskWarnings: string[];
  serverNow: string;
}

const QUICK_MESSAGES = (topic: string) => [
  `Welcome everyone! Today's topic: ${topic}`,
  "About 5 minutes left.",
  "1 minute left — start wrapping up!",
  "That's time — thanks everyone!",
];

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const [interval, setIntervalMs] = useState<number | undefined>(3000);
  const { data, error, reload } = useApi<SessionDetail>(`/api/admin/sessions/${id}`, { interval });
  const [tab, setTab] = useState<"chat" | "gaps" | "record" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const me = useMemo(() => ({ key: "moderator", label: "Moderator", role: "moderator" as const }), []);
  const onPing = useCallback(() => void reload(), [reload]);
  const room = useRoom(id, me, onPing);

  const [offset, setOffset] = useState(0);
  const serverNow = data?.serverNow;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clock skew measured when each response arrives
    if (serverNow) setOffset(Date.parse(serverNow) - Date.now());
  }, [serverNow]);

  const status = data?.session.status;
  const wanted = status === "live" ? 2500 : status === "scheduled" ? 5000 : undefined;
  if (data && wanted !== interval) setIntervalMs(wanted);

  const control = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action);
    setActionError(null);
    try {
      await api(`/api/admin/sessions/${id}/control`, { body: { action, ...extra } });
      await reload();
      room.ping();
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const sendOperator = async (body: string) => {
    try {
      await api(`/api/admin/sessions/${id}/messages`, { body: { body, clientId: newClientId() } });
      await reload();
      room.ping();
    } catch (e) {
      setActionError(errorText(e));
    }
  };

  if (error && !data) return <Notice tone="error">{error}</Notice>;
  if (!data) return <div className="flex items-center gap-2 text-sm text-stone-500"><Spinner /> Loading…</div>;

  const s = data.session;
  const activeTab = tab ?? (s.status === "ended" ? "gaps" : "chat");
  const participantCount = data.messages.filter((m) => !m.is_operator).length;
  const operatorCount = data.messages.length - participantCount;

  return (
    <>
      <PageHeader
        back={<Link href={`/admin/groups/${data.group.id}`} className="text-stone-500 hover:text-stone-800">← {data.group.name}</Link>}
        title={<span className="flex items-center gap-3">{s.title} <StatusBadge status={s.status} /> {s.status === "live" && <Countdown endsAt={s.ends_at} offsetMs={offset} onElapsed={() => void reload()} />}</span>}
        description={<>Topic: {s.topic}</>}
        actions={
          <>
            {s.status === "scheduled" && (
              <Button busy={busy === "start"} onClick={() => void control("start")}>Start session ({Math.round(s.duration_seconds / 60)} min)</Button>
            )}
            {s.status === "live" && (
              <>
                <Button variant="secondary" size="sm" busy={busy === "extend"} onClick={() => void control("extend", { seconds: 60 })}>+1 min</Button>
                <Button variant="secondary" size="sm" onClick={() => void control("extend", { seconds: 300 })}>+5 min</Button>
                <Button variant="danger" size="sm" busy={busy === "end"} onClick={() => confirm("End the session now?") && void control("end")}>End now</Button>
              </>
            )}
            {s.status === "ended" && (
              <>
                <Button variant="secondary" size="sm" busy={busy === "recompute"} onClick={() => void control("recompute")}>Recompute record</Button>
                <Button variant="ghost" size="sm" onClick={() => confirm("Reopen the chat for 2 more minutes?") && void control("reopen", { seconds: 120 })}>Reopen</Button>
              </>
            )}
          </>
        }
      />
      {actionError && <div className="mb-4"><Notice tone="error">{actionError}</Notice></div>}

      <div className="mb-4 flex gap-1 border-b border-stone-200">
        {(
          [
            ["chat", "Chat"],
            ["gaps", "Transcript & gaps"],
            ["record", "Session record"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cx("-mb-px border-b-2 px-3 py-2 text-sm", activeTab === key ? "border-accent font-medium text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800")}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "chat" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="flex h-[70vh] flex-col overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
            <ChatTranscript
              className="flex-1"
              messages={data.messages.map<ChatMessage>((m) => ({
                key: String(m.id),
                author: m.is_operator ? "Moderator" : `${m.author_label} (${m.speaker})`,
                body: m.body,
                at: m.created_at,
                mine: false,
                operator: m.is_operator,
                highlight: m.is_masked,
              }))}
              empty={s.status === "scheduled" ? "Participants can see the lobby. Start the session when everyone is here." : "No messages."}
            />
            <TypingLine names={room.typing.filter((n) => n !== "Moderator")} />
            {s.status !== "ended" ? (
              <Composer
                onSend={(t) => void sendOperator(t)}
                onTyping={room.notifyTyping}
                placeholder="Message as Moderator"
                note="You're in the chat as Moderator. Your messages are stored but flagged and excluded from gaps, predictions and results."
              />
            ) : (
              <div className="border-t border-stone-200 bg-white px-4 py-3 text-sm text-stone-500">This session has ended.</div>
            )}
          </div>
          <div className="space-y-4">
            <Card title="In the room">
              <div className="flex flex-wrap gap-1.5">
                {room.present.length === 0 && <span className="text-sm text-stone-500">{room.connected ? "Nobody yet." : "Realtime presence unavailable."}</span>}
                {room.present.map((p) => (
                  <Badge key={p.key} tone={p.role === "moderator" ? "amber" : "teal"}>{p.label}</Badge>
                ))}
              </div>
              <p className="mt-3 text-xs text-stone-500">{data.participants.length} participant{data.participants.length === 1 ? "" : "s"} registered in this group.</p>
            </Card>
            {s.status !== "ended" && (
              <Card title="Quick messages">
                <div className="space-y-2">
                  {QUICK_MESSAGES(s.topic).map((q) => (
                    <button key={q} onClick={() => void sendOperator(q)} className="block w-full rounded-lg border border-stone-200 px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50">
                      {q}
                    </button>
                  ))}
                </div>
              </Card>
            )}
            <Card title="Counts">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-stone-500">Participant msgs</dt><dd className="text-right tabular">{participantCount}</dd>
                <dt className="text-stone-500">Moderator msgs</dt><dd className="text-right tabular">{operatorCount}</dd>
              </dl>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "gaps" && <GapsTab data={data} reload={reload} />}
      {activeTab === "record" && <RecordTab stats={s.stats} computedAt={s.stats_computed_at} />}
    </>
  );
}

function GapsTab({ data, reload }: { data: SessionDetail; reload: () => Promise<void> }) {
  const s = data.session;
  const cfg: MaskConfig | null = s.mask_config;
  // Start from the last random draw's settings; hand-picked gaps carry no ratio or seed.
  const [opts, setOpts] = useState(() => {
    const base = { ...DEFAULT_MASK_OPTIONS };
    if (cfg?.method !== "random") return base;
    return { ratio: cfg.ratio, seed: cfg.seed, skipFirst: cfg.skipFirst, protectLast: cfg.protectLast, noAdjacent: cfg.noAdjacent, stratify: cfg.stratify };
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectionWarnings, setSelectionWarnings] = useState<string[]>([]);
  const masked = data.messages.filter((m) => m.is_masked).length;
  const participantMessages = data.messages.filter((m) => !m.is_operator);
  const start = data.messages[0] ? Date.parse(data.messages[0].created_at) : 0;

  const generate = async () => {
    if (masked && !confirm("Replace the current gaps with a new selection?")) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ selection: { warnings: string[] } }>(`/api/admin/sessions/${s.id}/mask`, { body: opts });
      setSelectionWarnings(res.selection.warnings);
      await reload();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const patch = async (messageId: number, body: Record<string, unknown>) => {
    try {
      await api(`/api/admin/sessions/${s.id}/messages`, { method: "PATCH", body: { messageId, ...body } });
      await reload();
    } catch (e) {
      setErr(errorText(e));
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card title="Transcript" description="Highlighted rows are gaps. Moderator messages are never eligible.">
        <div className="-mx-5 overflow-x-auto">
          <table className="data">
            <thead>
              <tr><th className="num">#</th><th>Time</th><th>Speaker</th><th>Message</th><th className="num">Words</th><th>Gap</th><th>Type</th></tr>
            </thead>
            <tbody>
              {data.messages.map((m) => (
                <tr key={m.id} className={cx(m.is_operator && "bg-amber-50/50 text-stone-500", m.is_masked && "bg-amber-100/60")}>
                  <td className="num text-stone-400">{m.seq ?? ""}</td>
                  <td className="tabular whitespace-nowrap text-stone-400">{seconds((Date.parse(m.created_at) - start) / 1000)}</td>
                  <td className="whitespace-nowrap">{m.is_operator ? <Badge tone="amber">Moderator</Badge> : <span><span className="font-mono text-xs text-stone-400">{m.speaker}</span> {m.author_label}</span>}</td>
                  <td className="max-w-md whitespace-pre-wrap break-words">{m.body}</td>
                  <td className="num">{m.is_operator ? "" : m.words}</td>
                  <td>
                    {!m.is_operator && s.status === "ended" && (
                      <input type="checkbox" checked={m.is_masked} onChange={(e) => void patch(m.id, { isMasked: e.target.checked })} className="h-4 w-4 accent-[var(--color-accent)]" aria-label="Gap" />
                    )}
                  </td>
                  <td>
                    {!m.is_operator && (
                      <select
                        value={m.msg_type ?? ""}
                        onChange={(e) => void patch(m.id, { msgType: e.target.value || null })}
                        className="rounded border border-stone-200 bg-white px-1 py-0.5 text-xs text-stone-600"
                      >
                        <option value="">–</option>
                        {MSG_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="space-y-4">
        <Card title="Choose gaps" description="Seeded random selection, reproducible from the seed.">
          {s.status !== "ended" ? (
            <Notice>Gaps are chosen after the session ends.</Notice>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Share hidden"><Input type="number" min={1} max={50} value={Math.round(opts.ratio * 100)} onChange={(e) => setOpts({ ...opts, ratio: Number(e.target.value) / 100 })} /></Field>
                <Field label="Seed"><Input type="number" value={opts.seed} onChange={(e) => setOpts({ ...opts, seed: Number(e.target.value) })} /></Field>
              </div>
              <Field label="Never the first N messages"><Input type="number" min={0} max={20} value={opts.skipFirst} onChange={(e) => setOpts({ ...opts, skipFirst: Number(e.target.value) })} /></Field>
              <Checkbox label="Never two gaps in a row" checked={opts.noAdjacent} onChange={(v) => setOpts({ ...opts, noAdjacent: v })} />
              <Checkbox label="Never the final message" checked={opts.protectLast} onChange={(v) => setOpts({ ...opts, protectLast: v })} />
              <Checkbox label="Stratify by length (short vs longer)" hint="Keeps the share of short reactions among gaps close to the conversation's." checked={opts.stratify} onChange={(v) => setOpts({ ...opts, stratify: v })} />
              {err && <Notice tone="error">{err}</Notice>}
              <div className="flex gap-2">
                <Button busy={busy} onClick={() => void generate()}>{masked ? "Re-pick gaps" : "Pick gaps"}</Button>
                {masked > 0 && (
                  <Button variant="ghost" onClick={async () => { if (confirm("Clear all gaps?")) { await api(`/api/admin/sessions/${s.id}/mask`, { method: "DELETE" }); await reload(); } }}>Clear</Button>
                )}
              </div>
            </div>
          )}
        </Card>
        <Card title="Current gaps">
          <div className="text-3xl font-semibold tabular">{masked}<span className="text-base font-normal text-stone-500"> / {participantMessages.length} ({pct(participantMessages.length ? masked / participantMessages.length : null)})</span></div>
          {cfg && (
            <p className="mt-2 text-xs text-stone-500">
              {cfg.method === "random" ? `Random, seed ${cfg.seed}, ${pct(cfg.ratio)} target` : "Picked by hand"}
              {cfg.edited ? " · edited by hand" : ""}
            </p>
          )}
          {[...selectionWarnings, ...data.maskWarnings].map((w) => (
            <div key={w} className="mt-2"><Notice tone="warning">{w}</Notice></div>
          ))}
          {masked > 0 && <Link href="/admin/runs" className="mt-3 inline-block text-sm font-medium text-accent hover:underline">Create an AI run →</Link>}
        </Card>
      </div>
    </div>
  );
}

function RecordTab({ stats, computedAt }: { stats: SessionStats | null; computedAt: string | null }) {
  if (!stats) return <Notice>The session record is written automatically when the session ends.</Notice>;
  const max = Math.max(1, ...stats.perMinute);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Stat label="Messages" value={stats.messages} hint={`${stats.operatorMessages} moderator excluded`} />
        <Stat label="Duration" value={seconds(stats.actualDurationSec)} />
        <Stat label="Msgs / min" value={num(stats.messagesPerMinute, 1)} />
        <Stat label="Words / msg" value={num(stats.wordsPerMessage.mean, 1)} hint={`median ${num(stats.wordsPerMessage.median, 0)}`} />
        <Stat label="Short (≤3 words)" value={pct(stats.shares.short)} />
        <Stat label="Balance" value={num(stats.participation.entropy, 2)} hint="1 = perfectly even" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Style of the conversation">
          <table className="data">
            <tbody>
              {(
                [
                  ["Questions", stats.shares.question],
                  ["Exclamations", stats.shares.exclamation],
                  ["Emoji", stats.shares.emoji],
                  ["Laughter (lol, haha)", stats.shares.laughter],
                  ["Slang / abbreviations", stats.shares.slang],
                  ["First-person (I, me, my)", stats.shares.firstPerson],
                  ["Starts lowercase", stats.shares.startsLowercase],
                  ["Ends with punctuation", stats.shares.endsWithPunctuation],
                  ["All lowercase", stats.shares.allLowercase],
                ] as const
              ).map(([label, v]) => (
                <tr key={label}><td>{label}</td><td className="num">{pct(v)}</td></tr>
              ))}
              <tr><td>Type–token ratio</td><td className="num">{num(stats.typeTokenRatio, 3)}</td></tr>
            </tbody>
          </table>
        </Card>
        <Card title="Turn-taking">
          <table className="data">
            <tbody>
              <tr><td>Speaker switch rate</td><td className="num">{pct(stats.speakerSwitchRate)}</td></tr>
              <tr><td>Mean run of messages by one person</td><td className="num">{num(stats.meanBurstLength, 2)}</td></tr>
              <tr><td>Median gap between messages</td><td className="num">{seconds(stats.gapSeconds.median)}</td></tr>
              <tr><td>90th percentile gap</td><td className="num">{seconds(stats.gapSeconds.p90)}</td></tr>
              <tr><td>Median reply latency (speaker change)</td><td className="num">{seconds(stats.responseLatencySeconds.median)}</td></tr>
              <tr><td>Gini (participation)</td><td className="num">{num(stats.participation.gini, 3)}</td></tr>
            </tbody>
          </table>
          <h3 className="mb-2 mt-4 text-sm font-medium text-stone-700">By speaker</h3>
          <table className="data">
            <thead><tr><th>Speaker</th><th className="num">Messages</th><th className="num">Words</th><th className="num">Words/msg</th><th className="num">Short</th></tr></thead>
            <tbody>
              {stats.perSpeaker.map((p) => (
                <tr key={p.speaker}><td className="font-mono">{p.speaker}</td><td className="num">{p.messages}</td><td className="num">{p.words}</td><td className="num">{num(p.meanWords, 1)}</td><td className="num">{pct(p.shortShare)}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      <Card title="Messages per minute">
        <div className="flex h-32 items-end gap-1">
          {stats.perMinute.map((v, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-t bg-accent/70" style={{ height: `${(v / max) * 100}%` }} title={`${v} messages`} />
              <span className="text-[10px] text-stone-400">{i + 1}</span>
            </div>
          ))}
        </div>
      </Card>
      <p className="text-xs text-stone-400">Recorded {computedAt ? new Date(computedAt).toLocaleString() : "–"}. Moderator messages are excluded from every figure.</p>
    </div>
  );
}
