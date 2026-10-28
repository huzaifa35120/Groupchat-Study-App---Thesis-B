"use client";
// Chat transcript, composer and countdown shared by the participant and moderator views.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "./ui";

export interface ChatMessage {
  key: string;
  author: string;
  body: string;
  at: string;
  mine: boolean;
  operator: boolean;
  pending?: boolean;
  failed?: boolean;
  onRetry?: () => void;
  aside?: ReactNode;
  highlight?: boolean;
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function ChatTranscript({ messages, empty, className }: { messages: ChatMessage[]; empty?: ReactNode; className?: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  return (
    <div
      ref={scroller}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
      className={cx("overflow-y-auto px-4 py-4", className)}
    >
      {messages.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-stone-400">{empty ?? "No messages yet."}</div>
      ) : (
        <ul className="space-y-1">
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const showAuthor = !prev || prev.author !== m.author || prev.operator !== m.operator;
            if (m.operator) {
              return (
                <li key={m.key} className={cx("flex justify-center py-1.5", showAuthor && "pt-3")}>
                  <div className="max-w-[85%] rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-900 ring-1 ring-amber-200">
                    <span className="mr-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">Moderator</span>
                    <span className="whitespace-pre-wrap break-words">{m.body}</span>
                    {m.aside}
                  </div>
                </li>
              );
            }
            return (
              <li key={m.key} className={cx("flex flex-col", m.mine ? "items-end" : "items-start", showAuthor && "pt-3")}>
                {showAuthor && (
                  <span className="mb-0.5 px-1 text-xs font-medium text-stone-500">
                    {m.mine ? "You" : m.author}
                    <span className="ml-1.5 font-normal text-stone-400">{time(m.at)}</span>
                  </span>
                )}
                <div className="flex max-w-[85%] items-end gap-2">
                  <div
                    className={cx(
                      "whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug",
                      m.mine ? "rounded-br-md bg-accent text-white" : "rounded-bl-md bg-white text-stone-900 ring-1 ring-stone-200",
                      m.pending && "opacity-60",
                      m.failed && "bg-red-100 text-red-900 ring-1 ring-red-300",
                      m.highlight && "ring-2 ring-amber-400",
                    )}
                  >
                    {m.body}
                  </div>
                  {m.aside}
                </div>
                {m.failed && (
                  <button onClick={m.onRetry} className="mt-0.5 px-1 text-xs font-medium text-red-700 hover:underline">
                    Not sent — tap to retry
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function Composer({
  onSend,
  onTyping,
  disabled,
  placeholder,
  note,
}: {
  onSend: (text: string) => void;
  onTyping?: () => void;
  disabled?: boolean;
  placeholder?: string;
  note?: ReactNode;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  const submit = () => {
    const clean = text.trim();
    if (!clean || disabled) return;
    onSend(clean);
    setText("");
  };

  return (
    <div className="border-t border-stone-200 bg-white px-3 py-3">
      {note && <div className="mb-2 px-1 text-xs text-stone-500">{note}</div>}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={ref}
          rows={1}
          value={text}
          disabled={disabled}
          maxLength={2000}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value) onTyping?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder ?? "Message"}
          className="max-h-36 min-h-10 flex-1 resize-none rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-[15px] text-stone-900 placeholder:text-stone-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:bg-stone-50"
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="h-10 shrink-0 rounded-xl bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}

export function Countdown({ endsAt, offsetMs, onElapsed }: { endsAt: string | null; offsetMs: number; onElapsed?: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const remaining = endsAt ? Math.max(0, Date.parse(endsAt) - (now + offsetMs)) : 0;
  useEffect(() => {
    if (endsAt && remaining === 0 && !fired.current) {
      fired.current = true;
      onElapsed?.();
    }
    if (remaining > 0) fired.current = false;
  }, [remaining, endsAt, onElapsed]);
  if (!endsAt) return null;
  const s = Math.ceil(remaining / 1000);
  return (
    <span className={cx("tabular rounded-md px-2 py-0.5 font-mono text-sm font-semibold", s <= 60 ? "bg-red-50 text-red-700" : "bg-stone-100 text-stone-700")}>
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

export function TypingLine({ names }: { names: string[] }) {
  return (
    <div className="h-5 px-4 text-xs text-stone-400">
      {names.length > 0 && `${names.join(", ")} ${names.length === 1 ? "is" : "are"} typing…`}
    </div>
  );
}
