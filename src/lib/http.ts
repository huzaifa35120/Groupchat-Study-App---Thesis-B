// Small helpers shared by the route handlers.
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

export function route<C>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, { status: err.status });
      if (err instanceof ZodError) {
        return json({ error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
      }
      console.error(err);
      const message = err instanceof Error ? err.message : "Unexpected error";
      return json({ error: message }, { status: 500 });
    }
  };
}

export function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new HttpError(500, result.error.message);
  return result.data;
}
