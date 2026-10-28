"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, Checkbox, Empty, Field, Input, Notice, PageHeader, Select, Spinner, StatusBadge, Textarea } from "@/components/ui";
import { DEFAULT_RUN_CONFIG, type RunConfig } from "@/lib/ai/prompts";
import { api, errorText, useApi } from "@/lib/client";
import { DEFAULT_MODEL, EFFORT_LEVELS } from "@/lib/constants";
import { dateTime } from "@/lib/format";

interface RunListItem {
  id: string;
  name: string;
  model: string;
  status: string;
  total: number;
  done: number;
  errors: number;
  pending: number;
  humanScored: number;
  llmScored: number;
  created_at: string;
  config: RunConfig;
}

interface Overview {
  groups: { id: string; name: string; sessions: { id: string; title: string; status: string; masked: number; messages: number }[] }[];
}

const PRESETS: { label: string; description: string; name: string; config: Partial<RunConfig> }[] = [
  { label: "Main", description: "Full conversation on both sides of the gap", name: "Main — bidirectional context", config: {} },
  { label: "Preceding only", description: "Only what came before the gap (next-message prediction)", name: "Ablation — preceding context only", config: { contextMode: "preceding" } },
  { label: "Local window", description: "5 messages either side", name: "Ablation — 5-message window", config: { windowBefore: 5, windowAfter: 5 } },
  { label: "No speaker", description: "Speaker of the gap hidden", name: "Ablation — speaker withheld", config: { revealSpeaker: false } },
];

export default function RunsPage() {
  const { data, error, reload } = useApi<{ runs: RunListItem[] }>("/api/admin/runs");
  const { data: overview } = useApi<Overview>("/api/admin/overview");

  return (
    <>
      <PageHeader title="AI runs" description="Each run sends every gap in the chosen sessions to the model with one fixed configuration." />
      <div className="grid gap-6 xl:grid-cols-[1fr_440px]">
        <div className="space-y-3">
          {error && <Notice tone="error">{error}</Notice>}
          {!data && !error && <div className="flex items-center gap-2 text-sm text-stone-500"><Spinner /> Loading…</div>}
          {data?.runs.length === 0 && <Empty>No runs yet. Pick gaps on finished sessions, then create a run.</Empty>}
          {data?.runs.map((r) => (
            <Link key={r.id} href={`/admin/runs/${r.id}`} className="block rounded-xl border border-stone-200 bg-white px-5 py-4 transition-colors hover:border-stone-300">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-stone-900">{r.name}</span>
                <StatusBadge status={r.status} />
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                <span className="font-mono">{r.model}</span>
                <span>effort {r.config.effort}</span>
                <span>{r.config.contextMode === "bidirectional" ? "both sides" : "preceding only"}</span>
                <span>{dateTime(r.created_at)}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Badge>{r.done}/{r.total} predicted</Badge>
                {r.errors > 0 && <Badge tone="red">{r.errors} errors</Badge>}
                <Badge tone="teal">{r.humanScored} human-scored</Badge>
                <Badge tone="blue">{r.llmScored} LLM-judged</Badge>
              </div>
            </Link>
          ))}
        </div>
        <NewRun overview={overview} onCreated={() => void reload()} />
      </div>
    </>
  );
}

function NewRun({ overview, onCreated }: { overview: Overview | null; onCreated: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(PRESETS[0].name);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [config, setConfig] = useState<RunConfig>(DEFAULT_RUN_CONFIG);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof RunConfig>(key: K, value: RunConfig[K]) => setConfig((c) => ({ ...c, [key]: value }));

  const ready = overview?.groups.flatMap((g) => g.sessions.filter((s) => s.status === "ended" && s.masked > 0).map((s) => ({ ...s, group: g.name }))) ?? [];
  const chosen = ready.filter((s) => selected[s.id]);

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ run: { id: string } }>("/api/admin/runs", { body: { name, model, sessionIds: chosen.map((s) => s.id), config } });
      onCreated();
      router.push(`/admin/runs/${res.run.id}`);
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
    }
  };

  return (
    <Card title="New run" description="Settings are stored with the run and with every prediction.">
      <div className="space-y-4">
        <div>
          <span className="mb-1 block text-sm font-medium text-stone-700">Preset</span>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => { setName(p.name); setConfig({ ...DEFAULT_RUN_CONFIG, ...p.config, systemPrompt: config.systemPrompt, effort: config.effort }); }}
                className="rounded-lg border border-stone-200 px-3 py-2 text-left hover:border-accent"
              >
                <span className="block text-sm font-medium">{p.label}</span>
                <span className="block text-xs text-stone-500">{p.description}</span>
              </button>
            ))}
          </div>
        </div>
        <Field label="Run name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div>
          <span className="mb-1 block text-sm font-medium text-stone-700">Sessions ({chosen.length} selected, {chosen.reduce((a, s) => a + s.masked, 0)} gaps)</span>
          {ready.length === 0 ? (
            <Notice>No finished sessions with gaps yet.</Notice>
          ) : (
            <div className="space-y-1.5 rounded-lg border border-stone-200 p-3">
              <button type="button" className="mb-1 text-xs text-accent hover:underline" onClick={() => setSelected(Object.fromEntries(ready.map((s) => [s.id, true])))}>Select all</button>
              {ready.map((s) => (
                <Checkbox key={s.id} label={`${s.group} · ${s.title}`} hint={`${s.masked} gaps of ${s.messages} messages`} checked={Boolean(selected[s.id])} onChange={(v) => setSelected((x) => ({ ...x, [s.id]: v }))} />
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Model" hint="Claude Opus 5 by default"><Input value={model} onChange={(e) => setModel(e.target.value)} className="font-mono" /></Field>
          <Field label="Effort" hint="Adaptive thinking depth">
            <Select value={config.effort} onChange={(e) => set("effort", e.target.value as RunConfig["effort"])}>
              {EFFORT_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Context">
            <Select value={config.contextMode} onChange={(e) => set("contextMode", e.target.value as RunConfig["contextMode"])}>
              <option value="bidirectional">Both sides</option>
              <option value="preceding">Before only</option>
            </Select>
          </Field>
          <Field label="Msgs before" hint="blank = all"><Input type="number" min={1} value={config.windowBefore ?? ""} onChange={(e) => set("windowBefore", e.target.value ? Number(e.target.value) : null)} /></Field>
          <Field label="Msgs after" hint="blank = all"><Input type="number" min={1} disabled={config.contextMode === "preceding"} value={config.windowAfter ?? ""} onChange={(e) => set("windowAfter", e.target.value ? Number(e.target.value) : null)} /></Field>
        </div>
        <Field label="Other gaps in the transcript">
          <Select value={config.otherGaps} onChange={(e) => set("otherGaps", e.target.value as RunConfig["otherGaps"])}>
            <option value="visible">Shown as originally written (one gap at a time)</option>
            <option value="hidden">Also hidden</option>
          </Select>
        </Field>
        <div className="space-y-2">
          <Checkbox label="Tell the model who sent the missing message" checked={config.revealSpeaker} onChange={(v) => set("revealSpeaker", v)} />
          <Checkbox label="Include the topic seed" checked={config.includeTopic} onChange={(v) => set("includeTopic", v)} />
          <Checkbox label="Include moderator messages (labelled as the researcher)" checked={config.includeOperator} onChange={(v) => set("includeOperator", v)} />
          <Checkbox label="Include timestamps" checked={config.includeTimestamps} onChange={(v) => set("includeTimestamps", v)} />
          <Checkbox label="Replace made-up names with Speaker 1/2/3" checked={config.anonymiseSpeakers} onChange={(v) => set("anonymiseSpeakers", v)} />
        </div>
        <details>
          <summary className="cursor-pointer text-sm font-medium text-stone-700">System prompt ({config.promptVersion})</summary>
          <Textarea rows={12} value={config.systemPrompt} onChange={(e) => set("systemPrompt", e.target.value)} className="mt-2 font-mono text-xs" />
          <Field label="Prompt version label" className="mt-2"><Input value={config.promptVersion} onChange={(e) => set("promptVersion", e.target.value)} /></Field>
        </details>
        {err && <Notice tone="error">{err}</Notice>}
        <Button className="w-full" busy={busy} disabled={!chosen.length || !name.trim()} onClick={() => void create()}>Create run</Button>
      </div>
    </Card>
  );
}
