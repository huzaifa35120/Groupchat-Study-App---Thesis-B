"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Checkbox, Field, Input, Notice, Spinner, StatusBadge } from "@/components/ui";
import { api, errorText, useApi } from "@/lib/client";
import { CONSENT_ITEMS } from "@/lib/constants";
import { clearAccess, loadAccess, saveAccess, type StoredAccess } from "@/lib/participant-store";
import { INFO_SECTIONS, INVESTIGATOR, INVESTIGATOR_EMAIL, STUDY_TITLE, SUPERVISOR } from "@/lib/study-info";

interface GroupResponse {
  group: { code: string; name: string };
  me: { pseudonym: string } | null;
  sessions: { id: string; number: number; title: string; status: string; endsAt: string | null }[];
}

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const groupCode = code.toUpperCase();
  const [access, setAccess] = useState<StoredAccess | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read localStorage after mount
    setAccess(loadAccess(groupCode));
    setReady(true);
  }, [groupCode]);

  const headers = useMemo(() => (access ? { "x-access-code": access.accessCode } : undefined), [access]);
  const { data, error, reload } = useApi<GroupResponse>(ready ? `/api/p/groups/${groupCode}` : null, {
    interval: access ? 5000 : undefined,
    headers,
  });

  // Stored code no longer valid (e.g. withdrawn or deleted)
  useEffect(() => {
    if (data && access && !data.me) {
      clearAccess(groupCode);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with server state
      setAccess(null);
    }
  }, [data, access, groupCode]);

  if (!ready || (!data && !error)) {
    return (
      <Shell>
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <Spinner /> Loading…
        </div>
      </Shell>
    );
  }
  if (error && !data) {
    return (
      <Shell>
        <Notice tone="error">{error}</Notice>
      </Shell>
    );
  }
  if (!data) return null;

  if (!access || !data.me) {
    return (
      <Shell>
        <Onboarding
          groupCode={groupCode}
          onJoined={(a) => {
            saveAccess(groupCode, a);
            setAccess(a);
          }}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <Lobby data={data} access={access} groupCode={groupCode} onWithdrawn={() => { clearAccess(groupCode); setAccess(null); void reload(); }} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10">
      <p className="text-sm font-medium text-accent">Group chat study</p>
      <div className="mt-6">{children}</div>
    </main>
  );
}

function Onboarding({ groupCode, onJoined }: { groupCode: string; onJoined: (a: StoredAccess) => void }) {
  const [step, setStep] = useState<"info" | "consent" | "name" | "code" | "returning">("info");
  const [consent, setConsent] = useState<Record<string, boolean>>({});
  const [summaryEmail, setSummaryEmail] = useState("");
  const [wantsSummary, setWantsSummary] = useState(false);
  const [pseudonym, setPseudonym] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<StoredAccess | null>(null);
  const [returningCode, setReturningCode] = useState("");
  const allTicked = CONSENT_ITEMS.every((i) => consent[i.id]);

  const join = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await api<StoredAccess>(`/api/p/groups/${groupCode}/join`, {
        body: { pseudonym, consent, summaryEmail: wantsSummary ? summaryEmail : "" },
      });
      setCreated(res);
      setStep("code");
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const signIn = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ pseudonym: string; group: { code: string } }>(`/api/p/me`, {
        method: "POST",
        headers: { "x-access-code": returningCode.trim() },
      });
      if (res.group.code !== groupCode) throw new Error("That code belongs to a different group link.");
      onJoined({ accessCode: returningCode.trim().toUpperCase(), pseudonym: res.pseudonym });
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (step === "returning") {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-stone-600">Enter the access code you were shown when you first joined.</p>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void signIn(); }}>
          <Input value={returningCode} onChange={(e) => setReturningCode(e.target.value)} placeholder="XXXX-XXXX-XXXX" className="font-mono uppercase tracking-wider" autoFocus />
          {err && <Notice tone="error">{err}</Notice>}
          <div className="flex gap-2">
            <Button type="submit" busy={busy} disabled={!returningCode.trim()}>Continue</Button>
            <Button type="button" variant="ghost" onClick={() => { setErr(null); setStep("info"); }}>Back</Button>
          </div>
        </form>
      </div>
    );
  }

  if (step === "info") {
    return (
      <article className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold leading-snug tracking-tight">Participant information</h1>
          <p className="mt-2 text-sm text-stone-600">{STUDY_TITLE}</p>
          <p className="mt-1 text-xs text-stone-500">
            Student investigator: {INVESTIGATOR} — <a className="underline" href={`mailto:${INVESTIGATOR_EMAIL}`}>{INVESTIGATOR_EMAIL}</a>. Supervisor: {SUPERVISOR}.
          </p>
        </header>
        <div className="space-y-5 rounded-xl border border-stone-200 bg-white p-5">
          {INFO_SECTIONS.map((s) => (
            <section key={s.heading}>
              <h2 className="text-[15px] font-semibold text-stone-900">{s.heading}</h2>
              {s.body.map((p, i) => (
                <p key={i} className="mt-1.5 text-sm leading-relaxed text-stone-600">{p}</p>
              ))}
            </section>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setStep("consent")}>I&apos;ve read this — continue</Button>
          <button className="text-sm text-stone-500 underline-offset-2 hover:underline" onClick={() => setStep("returning")}>
            I&apos;ve already joined
          </button>
        </div>
      </article>
    );
  }

  if (step === "consent") {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold tracking-tight">Consent</h1>
        <p className="text-sm text-stone-600">Please tick each box. You won&apos;t be asked for your real name.</p>
        <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-5">
          {CONSENT_ITEMS.map((item) => (
            <Checkbox key={item.id} label={item.text} checked={Boolean(consent[item.id])} onChange={(v) => setConsent((c) => ({ ...c, [item.id]: v }))} />
          ))}
        </div>
        <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-5">
          <Checkbox
            label="Optional: please email me a one-page summary of the findings."
            hint="Your email goes on a separate list that is never linked to your messages, and is deleted once summaries are sent."
            checked={wantsSummary}
            onChange={setWantsSummary}
          />
          {wantsSummary && <Input type="email" placeholder="you@example.com" value={summaryEmail} onChange={(e) => setSummaryEmail(e.target.value)} />}
        </div>
        <div className="flex gap-2">
          <Button disabled={!allTicked || (wantsSummary && !summaryEmail.includes("@"))} onClick={() => setStep("name")}>Continue</Button>
          <Button variant="ghost" onClick={() => setStep("info")}>Back</Button>
        </div>
      </div>
    );
  }

  if (step === "name") {
    return (
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void join(); }}>
        <h1 className="text-2xl font-semibold tracking-tight">Pick a made-up name</h1>
        <p className="text-sm text-stone-600">This is the only name anyone will see, and the only one stored with your messages. Please don&apos;t use your real name.</p>
        <Field label="Made-up name" hint="2–24 characters. You'll use the same name in all three sessions.">
          <Input value={pseudonym} onChange={(e) => setPseudonym(e.target.value)} maxLength={24} autoFocus placeholder="e.g. Pineapple" />
        </Field>
        {err && <Notice tone="error">{err}</Notice>}
        <div className="flex gap-2">
          <Button type="submit" busy={busy} disabled={pseudonym.trim().length < 2}>Join the study</Button>
          <Button type="button" variant="ghost" onClick={() => setStep("consent")}>Back</Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">You&apos;re in, {created?.pseudonym}</h1>
      <p className="text-sm text-stone-600">
        This is your private access code. This browser remembers it, but write it down in case you switch devices — and you&apos;ll need it if you
        decide to withdraw later.
      </p>
      <div className="rounded-xl border-2 border-dashed border-accent/40 bg-accent-soft px-5 py-4 text-center font-mono text-2xl font-semibold tracking-[0.2em] text-accent-strong">
        {created?.accessCode}
      </div>
      <Button onClick={() => created && onJoined(created)}>Go to my sessions</Button>
    </div>
  );
}

function Lobby({ data, access, groupCode, onWithdrawn }: { data: GroupResponse; access: StoredAccess; groupCode: string; onWithdrawn: () => void }) {
  const live = data.sessions.find((s) => s.status === "live");
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const withdraw = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/p/withdraw`, { method: "POST", headers: { "x-access-code": access.accessCode } });
      setDone(true);
      setTimeout(onWithdrawn, 2500);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }, [access.accessCode, onWithdrawn]);

  if (done) {
    return <Notice tone="success">You&apos;ve withdrawn from the study and your conversations have been deleted. Thank you for your time.</Notice>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Hi {access.pseudonym}</h1>
        <p className="mt-1 text-sm text-stone-600">
          Keep this page open. When the researcher starts a session, a button to join will appear here.
        </p>
      </header>

      {live ? (
        <Link
          href={`/join/${groupCode}/s/${live.id}`}
          className="flex items-center justify-between rounded-xl bg-accent px-5 py-4 text-white shadow-sm transition-colors hover:bg-accent-strong"
        >
          <span>
            <span className="block text-xs font-medium uppercase tracking-wide text-white/80">Happening now</span>
            <span className="text-lg font-semibold">{live.title} — join the chat</span>
          </span>
          <span aria-hidden className="text-2xl">→</span>
        </Link>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-5 py-4 text-sm text-stone-600">
          <Spinner className="text-accent" /> Waiting for the next session to start…
        </div>
      )}

      <ol className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
        {data.sessions.map((s) => (
          <li key={s.id} className="flex items-center justify-between px-5 py-3">
            <span className="text-sm font-medium text-stone-800">{s.title}</span>
            <span className="flex items-center gap-3">
              <StatusBadge status={s.status} />
              {s.status === "live" && (
                <Link className="text-sm font-medium text-accent hover:underline" href={`/join/${groupCode}/s/${s.id}`}>Open</Link>
              )}
            </span>
          </li>
        ))}
      </ol>

      <section className="rounded-xl border border-stone-200 bg-white p-5 text-sm">
        <h2 className="font-semibold text-stone-900">Your access code</h2>
        <p className="mt-1 font-mono tracking-wider text-stone-700">{access.accessCode}</p>
        <h2 className="mt-5 font-semibold text-stone-900">Withdraw from the study</h2>
        <p className="mt-1 text-stone-600">
          You can withdraw at any time without giving a reason. All conversations you took part in will be deleted entirely. This can&apos;t be undone.
        </p>
        {!confirming ? (
          <Button className="mt-3" variant="danger" size="sm" onClick={() => setConfirming(true)}>Withdraw…</Button>
        ) : (
          <div className="mt-3 space-y-2">
            <Field label='Type "WITHDRAW" to confirm'>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} />
            </Field>
            {err && <Notice tone="error">{err}</Notice>}
            <div className="flex gap-2">
              <Button variant="danger" size="sm" busy={busy} disabled={typed.trim().toUpperCase() !== "WITHDRAW"} onClick={() => void withdraw()}>
                Withdraw and delete my data
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </section>
      <p className="text-xs text-stone-400">Group <Badge>{data.group.code}</Badge></p>
    </div>
  );
}
