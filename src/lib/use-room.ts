"use client";
// Realtime room for a session: who is here, who is typing, and "new message"
// pings. Message content is never sent over Realtime; a ping just tells the
// other clients to fetch from the server. If Realtime is unavailable the
// pages fall back to polling.
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseBrowser } from "./supabase/browser";

export interface RoomMember {
  key: string;
  label: string;
  role: "participant" | "moderator";
}

export function useRoom(sessionId: string, me: RoomMember | null, onPing: () => void) {
  const [present, setPresent] = useState<RoomMember[]>([]);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pingRef = useRef(onPing);
  const lastTyping = useRef(0);

  useEffect(() => {
    pingRef.current = onPing;
  }, [onPing]);

  useEffect(() => {
    const supabase = supabaseBrowser();
    if (!supabase || !me) return;
    const channel = supabase.channel(`room-${sessionId}`, {
      config: { presence: { key: me.key }, broadcast: { self: false } },
    });
    channel
      .on("broadcast", { event: "new" }, () => pingRef.current())
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const label = (payload as { label?: string })?.label;
        if (label) setTyping((t) => ({ ...t, [label]: Date.now() }));
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<RoomMember>();
        const members = new Map<string, RoomMember>();
        for (const [key, metas] of Object.entries(state)) {
          const meta = metas[0];
          if (meta) members.set(key, { key, label: meta.label, role: meta.role });
        }
        setPresent([...members.values()]);
      })
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") void channel.track({ label: me.label, role: me.role });
      });
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [sessionId, me]);

  // Expire typing indicators
  useEffect(() => {
    const timer = setInterval(() => {
      setTyping((t) => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(t).filter(([, at]) => now - at < 3500));
        return Object.keys(next).length === Object.keys(t).length ? t : next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const ping = useCallback(() => {
    void channelRef.current?.send({ type: "broadcast", event: "new", payload: {} });
  }, []);

  const notifyTyping = useCallback(() => {
    if (!me || Date.now() - lastTyping.current < 2000) return;
    lastTyping.current = Date.now();
    void channelRef.current?.send({ type: "broadcast", event: "typing", payload: { label: me.label } });
  }, [me]);

  return { present, typing: Object.keys(typing), connected, ping, notifyTyping };
}
