"use client";
// Fetch helpers for client components.
import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  url: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const res = await fetch(url, {
    method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
    headers: { ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}), ...options.headers },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export function useApi<T>(url: string | null, options: { interval?: number; headers?: Record<string, string> } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const headersKey = JSON.stringify(options.headers ?? {});
  const latest = useRef(0);

  const reload = useCallback(async () => {
    if (!url) return;
    const ticket = ++latest.current;
    try {
      const result = await api<T>(url, { headers: JSON.parse(headersKey) });
      if (ticket === latest.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (ticket === latest.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }, [url, headersKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    void reload();
    if (!options.interval) return;
    const timer = setInterval(() => void reload(), options.interval);
    return () => clearInterval(timer);
  }, [reload, options.interval]);

  return { data, error, loading, reload, setData };
}

export function newClientId(): string {
  return crypto.randomUUID();
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
