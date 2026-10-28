"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Empty, Field, Input, Notice, PageHeader, Spinner, StatusBadge, Textarea } from "@/components/ui";
import { api, errorText, useApi } from "@/lib/client";
import { TOPIC_SUGGESTIONS } from "@/lib/constants";
import { dateTime } from "@/lib/format";

interface GroupDetail {
  group: { id: string; name: string; code: string; notes: string | null };
  participants: { id: string; pseudonym: string; label: string; consented_at: string; messages: number; sessionsJoined: number }[];
  sessions: {
    id: string;
    session_number: number;
    title: string;
    topic: string;
    duration_seconds: number;
    status: string;
    started_at: string | null;
    messages: number;
    operatorMessages: number;
    masked: number;
  }[];
}

export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, reload } = useApi<GroupDetail>(`/api/admin/groups/${id}`, { interval: 6000 });
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window is client-only
    setOrigin(window.location.origin);
  }, []);

  if (error && !data) return <Notice tone="error">{error}</Notice>;
  if (!data) return <div className="flex items-center gap-2 text-sm text-stone-500"><Spinner /> Loading…</div>;

  const link = `${origin}/join/${data.group.code}`;
  const invite = `Hi! Thanks for agreeing to take part in my thesis study.\n\nOpen this link to read the participant information, give consent and pick a made-up name:\n${link}\n\nKeep the page open at our session times — a "join" button appears when each chat starts. Each chat runs for about ten minutes.\n\nThanks,\nHuzaifa`;

  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };

  const withdraw = async (pid: string, name: string) => {
    if (!confirm(`Withdraw ${name}? Every session they posted in will be deleted entirely (including the other participants' messages in those sessions). This can't be undone.`)) return;
    try {
      await api(`/api/admin/participants/${pid}`, { method: "DELETE" });
      void reload();
    } catch (e) {
      setActionError(errorText(e));
    }
  };

  const deleteGroup = async () => {
    if (!confirm(`Delete ${data.group.name} with all its sessions, messages and predictions? This can't be undone.`)) return;
    await api(`/api/admin/groups/${id}`, { method: "DELETE" });
    router.push("/admin");
  };

  return (
    <>
      <PageHeader
        back={<Link href="/admin" className="text-stone-500 hover:text-stone-800">← Sessions</Link>}
        title={data.group.name}
        description={<>Group code <span className="font-mono">{data.group.code}</span></>}
        actions={<Button variant="danger" size="sm" onClick={() => void deleteGroup()}>Delete group</Button>}
      />
      {actionError && <div className="mb-4"><Notice tone="error">{actionError}</Notice></div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Participant link" description="Email this to the three participants. Each one consents and picks a made-up name.">
          <div className="flex gap-2">
            <Input readOnly value={link} className="font-mono text-xs" />
            <Button variant="secondary" onClick={() => void copy(link, "link")}>{copied === "link" ? "Copied" : "Copy"}</Button>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-stone-600">Email template</summary>
            <Textarea readOnly rows={9} value={invite} className="mt-2 text-xs" />
            <Button className="mt-2" size="sm" variant="secondary" onClick={() => void copy(invite, "invite")}>{copied === "invite" ? "Copied" : "Copy email"}</Button>
          </details>
        </Card>

        <Card title="Participants" description="Labels P1–P3 are used in exports and results instead of names.">
          {data.participants.length === 0 ? (
            <Empty>Nobody has joined yet.</Empty>
          ) : (
            <table className="data">
              <thead><tr><th>Label</th><th>Made-up name</th><th>Consented</th><th className="num">Msgs</th><th className="num">Sessions</th><th></th></tr></thead>
              <tbody>
                {data.participants.map((p) => (
                  <tr key={p.id}>
                    <td className="font-mono">{p.label}</td>
                    <td className="font-medium">{p.pseudonym}</td>
                    <td className="text-stone-500">{dateTime(p.consented_at)}</td>
                    <td className="num">{p.messages}</td>
                    <td className="num">{p.sessionsJoined}</td>
                    <td className="text-right"><button className="text-xs text-red-700 hover:underline" onClick={() => void withdraw(p.id, p.pseudonym)}>Withdraw</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Sessions</h2>
      <div className="space-y-4">
        {data.sessions.map((s) => <SessionEditor key={s.id} session={s} onChange={() => void reload()} />)}
        <AddSession groupId={id} onAdded={() => void reload()} nextNumber={data.sessions.length + 1} />
      </div>
    </>
  );
}

function SessionEditor({ session, onChange }: { session: GroupDetail["sessions"][number]; onChange: () => void }) {
  const [title, setTitle] = useState(session.title);
  const [topic, setTopic] = useState(session.topic);
  const [minutes, setMinutes] = useState(session.duration_seconds / 60);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dirty = title !== session.title || topic !== session.topic || minutes * 60 !== session.duration_seconds;

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/admin/sessions/${session.id}`, { method: "PATCH", body: { title, topic, durationSeconds: Math.round(minutes * 60) } });
      onChange();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete ${session.title} and all of its messages?`)) return;
    await api(`/api/admin/sessions/${session.id}`, { method: "DELETE" });
    onChange();
  };

  return (
    <Card
      title={<span className="flex items-center gap-2">{session.title} <StatusBadge status={session.status} /></span>}
      description={session.started_at ? `Started ${dateTime(session.started_at)} · ${session.messages} participant messages · ${session.operatorMessages} moderator · ${session.masked} gaps` : "Not started"}
      actions={
        <>
          <Link href={`/admin/sessions/${session.id}`}><Button size="sm">{session.status === "live" ? "Join as moderator" : "Open session"}</Button></Link>
          <Button size="sm" variant="ghost" onClick={() => void remove()}>Delete</Button>
        </>
      }
    >
      <div className="grid gap-3 md:grid-cols-[180px_1fr_120px]">
        <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Topic seed (shown to participants when the session starts)">
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} list="topic-suggestions" />
        </Field>
        <Field label="Minutes"><Input type="number" min={1} max={120} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} disabled={session.status !== "scheduled"} /></Field>
      </div>
      <datalist id="topic-suggestions">{TOPIC_SUGGESTIONS.map((t) => <option key={t} value={t} />)}</datalist>
      {err && <div className="mt-2"><Notice tone="error">{err}</Notice></div>}
      {dirty && <div className="mt-3"><Button size="sm" busy={busy} onClick={() => void save()}>Save changes</Button></div>}
    </Card>
  );
}

function AddSession({ groupId, onAdded, nextNumber }: { groupId: string; onAdded: () => void; nextNumber: number }) {
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-stone-300 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api(`/api/admin/groups/${groupId}/sessions`, { body: { topic } });
          setTopic("");
          onAdded();
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label={`Add session ${nextNumber}`} className="min-w-64 flex-1">
        <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic seed" list="topic-suggestions" />
      </Field>
      <Button type="submit" variant="secondary" busy={busy} disabled={!topic.trim()}>Add</Button>
    </form>
  );
}
