// Supabase returns at most 1000 rows per request; page through larger tables.
import type { PostgrestFilterBuilder } from "@supabase/postgrest-js";
import { HttpError } from "./http";

type Query = PostgrestFilterBuilder<never, never, never, unknown[], string, unknown, "GET">;

export async function fetchAll<T>(build: () => unknown, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await (build() as Query).range(from, from + pageSize - 1);
    if (error) throw new HttpError(500, error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) break;
  }
  return out;
}
