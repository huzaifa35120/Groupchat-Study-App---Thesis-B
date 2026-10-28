"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatTranscript, Composer, Countdown, TypingLine, type ChatMessage } from "@/components/chat";
import { Badge, Notice, Spinner } from "@/components/ui";
import { api, ApiError, errorText, newClientId } from "@/lib/client";
import { loadAccess, type StoredAccess } from "@/lib/participant-store";
import type { PublicMessage } from "@/lib/types";
import { useRoom } from "@/lib/use-room";

interface SessionInfo {
  id: string;
  number: number;
  title: string;
  topic: string | null;
  status: "scheduled" | "live" | "ended";
  durationSeconds: number;
  endsAt: string | null;
}

interface Pending {
  clientId: string;
  body: string;
  at: string;
  failed: boolean;
}

export default function ParticipantChat() {
  const { code, sessionId } = useParams<{ code: string; sessionId: string }>();
  const groupCode = code.toUpperCase();
  const router = useRouter();
  const [access, setAccess] = useState<StoredAccess | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [messages, setMessages] = useState<PublicMessage[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const lastId = useRef(0);
  const inFlight = useRef(false);
  const again = useRef(false);

  useEffect(() => {
    const a = loadAccess(groupCode);
    if (!a) router.replace(`/join/${groupCode}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read localStorage after mount
    else setAccess(a);
  }, [groupCode, router]);

  const fetchNew = useCallback(async () => {
    if (!access) return;
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        again.current = false;
        const res = await api<{ session: SessionInfo; messages: PublicMessage[]; serverNow: string }>(
          `/api/p/sessions/${sessionId}?after=${lastId.current}`,
          { headers: { "x-access-code": access.accessCode } },
        );
        setOffset(Date.parse(res.serverNow) - Date.now());
        setSession(res.session);
        if (res.messages.length) {
          lastId.current = Math.max(lastId.current, ...res.messages.map((m) => m.id));
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            return [...prev, ...res.messages.filter((m) => !seen.has(m.id))].sort((a, b) => a.id - b.id);
          });
        }
        setError(null);
      } while (again.current);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.replace(`/join/${groupCode}`);
      else setError(errorText(e));
    } finally {
      inFlight.current = false;
    }
  }, [access, sessionId, router, groupCode]);

  const me = useMemo(() => (access ? { key: `p:${access.pseudonym}`, label: access.pseudonym, role: "participant" as const } : null), [access]);
  const room = useRoom(sessionId, me, fetchNew);

  const status = session?.status;
  useEffect(() => {
    if (!access) return;
    void fetchNew();
    if (status === "ended") return;
    const t = setInterval(() => void fetchNew(), status === "live" ? 2500 : 4000);
    return () => clearInterval(t);
  }, [access, fetchNew, status]);

  const send = useCallback(
    async (body: string, existingId?: string) => {
      if (!access) return;
      const clientId = existingId ?? newClientId();
      const at = new Date().toISOString();
      setPending((p) => (existingId ? p.map((x) => (x.clientId === clientId ? { ...x, failed: false } : x)) : [...p, { clientId, body, at, failed: false }]));
      try {
        const res = await api<{ message: PublicMessage }>(`/api/p/sessions/${sessionId}/messages`, {
          body: { body, clientId },
          headers: { "x-access-code": access.accessCode },
        });
        setPending((p) => p.filter((x) => x.clientId !== clientId));
        setMessages((prev) => (prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message].sort((a, b) => a.id - b.id)));
        room.ping();
      } catch (e) {
        setPending((p) => p.map((x) => (x.clientId === clientId ? { ...x, failed: true } : x)));
        setError(errorText(e));
        void fetchNew();
      }
    },
    [access, sessionId, room, fetchNew],
  );

  const items: ChatMessage[] = [
    ...messages.map((m) => ({ key: String(m.id), author: m.author, body: m.body, at: m.at, mine: m.mine, operator: m.operator })),
    ...pending.map((p) => ({
      key: p.clientId,
      author: access?.pseudonym ?? "You",
      body: p.body,
      at: p.at,
      mine: true,
      operator: false,
      pending: !p.failed,
      failed: p.failed,
      onRetry: () => void send(p.body, p.clientId),
    })),
  ];

  if (!access || !session) {
    return (
      <main className="flex flex-1 items-center justify-center gap-2 text-sm text-stone-500">
        {error ? <Notice tone="error">{error}</Notice> : (<><Spinner /> Connecting…</>)}
      </main>
    );
  }

  const others = room.present.filter((p) => p.key !== me?.key);
  const typing = room.typing.filter((n) => n !== access.pseudonym);

  return (
    <main className="mx-auto flex h-dvh w-full max-w-2xl flex-col">
      <header className="border-b border-stone-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/join/${groupCode}`} className="text-xs text-stone-500 hover:text-stone-700">← Sessions</Link>
            <h1 className="truncate text-base font-semibold text-stone-900">{session.title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {session.status === "live" && <Countdown endsAt={session.endsAt} offsetMs={offset} onElapsed={() => void fetchNew()} />}
            {session.status === "ended" && <Badge>Finished</Badge>}
          </div>
        </div>
        {session.topic && (
          <p className="mt-2 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-strong">
            <span className="font-semibold">Topic:</span> {session.topic}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
          <span>Here now:</span>
          <Badge tone="teal">{access.pseudonym} (you)</Badge>
          {others.map((p) => (
            <Badge key={p.key} tone={p.role === "moderator" ? "amber" : "neutral"}>{p.role === "moderator" ? "Moderator" : p.label}</Badge>
          ))}
          {!room.connected && <span className="text-stone-400">(live updates every few seconds)</span>}
        </div>
      </header>

      {session.status === "scheduled" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <Spinner className="text-accent" />
          <p className="text-sm text-stone-600">Waiting for the researcher to start the session. The topic will appear here when it begins.</p>
        </div>
      ) : (
        <ChatTranscript messages={items} className="flex-1" empty="Say hi to get things going." />
      )}

      <TypingLine names={typing} />
      {error && <div className="px-4 pb-2"><Notice tone="error">{error}</Notice></div>}
      {session.status === "ended" ? (
        <div className="border-t border-stone-200 bg-white px-4 py-4 text-center text-sm text-stone-600">
          Time&apos;s up — this session has finished. Thanks for chatting!{" "}
          <Link className="font-medium text-accent hover:underline" href={`/join/${groupCode}`}>Back to your sessions</Link>
        </div>
      ) : (
        <Composer
          disabled={session.status !== "live"}
          onSend={(t) => void send(t)}
          onTyping={room.notifyTyping}
          placeholder={session.status === "live" ? "Message the group" : "The chat opens when the session starts"}
        />
      )}
    </main>
  );
}
