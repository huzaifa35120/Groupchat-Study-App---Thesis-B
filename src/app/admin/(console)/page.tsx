"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, Empty, Field, Input, Notice, PageHeader, Spinner, StatusBadge } from "@/components/ui";
import { api, errorText, useApi } from "@/lib/client";

interface Overview {
  groups: {
    id: string;
    name: string;
    code: string;
    participants: number;
    sessions: { id: string; number: number; title: string; status: string; messages: number; masked: number; hasStats: boolean }[];
  }[];
  runs: { id: string; name: string; status: string }[];
}

interface Health {
  supabaseConfigured: boolean;
  database: string;
  anthropicConfigured: boolean;
  researcherEmails: number;
}

export default function Dashboard() {
  const router = useRouter();
  const { data, error, reload } = useApi<Overview>("/api/admin/overview", { interval: 8000 });
  const { data: health } = useApi<Health>("/api/health");
  const [name, setName] = useState("");
  const [count, setCount] = useState(3);
  const [minutes, setMinutes] = useState(10);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ group: { id: string } }>("/api/admin/groups", { body: { name, sessions: count, durationSeconds: minutes * 60 } });
      router.push(`/admin/groups/${res.group.id}`);
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
    }
  };

  const allSessions = data?.groups.flatMap((g) => g.sessions) ?? [];
  const steps = [
    { done: (data?.groups.length ?? 0) > 0, label: "Create a group and email participants its link" },
    { done: allSessions.some((s) => s.status !== "scheduled"), label: "Run the three sessions (start each from its session page)" },
    { done: allSessions.some((s) => s.masked > 0), label: "Choose the gaps for each finished session" },
    { done: (data?.runs.length ?? 0) > 0, label: "Create an AI run with Claude Opus 5 and process it" },
    { done: false, label: "Score the gaps, then read and export the Results" },
  ];

  return (
    <>
      <PageHeader title="Sessions" description="Groups of participants, their chat sessions, and live control." />

      {health && (!health.anthropicConfigured || health.database !== "ok") && (
        <div className="mb-6">
          <Notice tone="warning">
            {health.database !== "ok" && <>Database: {health.database}. Run the migrations (see README). </>}
            {!health.anthropicConfigured && <>ANTHROPIC_API_KEY isn&apos;t set, so AI runs won&apos;t work yet.</>}
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {error && <Notice tone="error">{error}</Notice>}
          {!data && !error && <div className="flex items-center gap-2 text-sm text-stone-500"><Spinner /> Loading…</div>}
          {data && data.groups.length === 0 && <Empty>No groups yet. Create one to get a join link for participants.</Empty>}
          {data?.groups.map((g) => (
            <Card
              key={g.id}
              title={<Link href={`/admin/groups/${g.id}`} className="hover:underline">{g.name}</Link>}
              description={<>Code <span className="font-mono">{g.code}</span> · {g.participants} participant{g.participants === 1 ? "" : "s"}</>}
              actions={<Link href={`/admin/groups/${g.id}`} className="text-sm font-medium text-accent hover:underline">Manage group →</Link>}
            >
              {g.sessions.length === 0 ? (
                <p className="text-sm text-stone-500">No sessions.</p>
              ) : (
                <table className="data">
                  <thead>
                    <tr><th>Session</th><th>Status</th><th className="num">Messages</th><th className="num">Gaps</th><th>Record</th><th></th></tr>
                  </thead>
                  <tbody>
                    {g.sessions.map((s) => (
                      <tr key={s.id}>
                        <td className="font-medium">{s.title}</td>
                        <td><StatusBadge status={s.status} /></td>
                        <td className="num">{s.messages}</td>
                        <td className="num">{s.masked || "–"}</td>
                        <td>{s.hasStats ? <Badge tone="teal">Recorded</Badge> : <span className="text-stone-400">–</span>}</td>
                        <td className="text-right"><Link href={`/admin/sessions/${s.id}`} className="font-medium text-accent hover:underline">{s.status === "live" ? "Join as moderator" : "Open"}</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card title="New group" description="Three people who will chat together in every session.">
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void create(); }}>
              <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group A" required /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sessions"><Input type="number" min={0} max={10} value={count} onChange={(e) => setCount(Number(e.target.value))} /></Field>
                <Field label="Minutes each"><Input type="number" min={1} max={120} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></Field>
              </div>
              {err && <Notice tone="error">{err}</Notice>}
              <Button type="submit" busy={busy} disabled={!name.trim()} className="w-full">Create group</Button>
            </form>
          </Card>
          <Card title="Study checklist">
            <ol className="space-y-2 text-sm">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className={s.done ? "text-accent" : "text-stone-300"}>{s.done ? "✓" : "○"}</span>
                  <span className={s.done ? "text-stone-500 line-through decoration-stone-300" : "text-stone-700"}>{s.label}</span>
                </li>
              ))}
            </ol>
            <button className="mt-3 text-xs text-stone-400 hover:text-stone-600" onClick={() => void reload()}>Refresh</button>
          </Card>
        </div>
      </div>
    </>
  );
}
