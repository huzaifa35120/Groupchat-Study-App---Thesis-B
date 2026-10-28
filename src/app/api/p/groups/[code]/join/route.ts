import { z } from "zod";
import { newAccessCode, hashAccessCode, normaliseCode } from "@/lib/codes";
import { CONSENT_ITEMS, CONSENT_VERSION, OPERATOR_LABEL } from "@/lib/constants";
import { HttpError, json, route } from "@/lib/http";
import { db } from "@/lib/supabase/admin";

const MAX_PARTICIPANTS = 10;

const Body = z.object({
  pseudonym: z
    .string()
    .trim()
    .min(2, "Pick a name with at least 2 characters")
    .max(24, "Keep the name under 24 characters")
    .regex(/^[\p{L}\p{N} _.'-]+$/u, "Use letters, numbers, spaces, dots, dashes or underscores"),
  consent: z.record(z.string(), z.boolean()),
  summaryEmail: z.string().trim().email().max(200).optional().or(z.literal("")),
});

export const POST = route(async (req, ctx: RouteContext<"/api/p/groups/[code]/join">) => {
  const { code } = await ctx.params;
  const body = Body.parse(await req.json());
  const missing = CONSENT_ITEMS.filter((item) => body.consent[item.id] !== true);
  if (missing.length) throw new HttpError(400, "Please tick every consent box to take part.");
  if (["moderator", "researcher", OPERATOR_LABEL.toLowerCase()].includes(body.pseudonym.toLowerCase())) {
    throw new HttpError(400, "That name is reserved. Please pick another.");
  }

  const sb = db();
  const { data: group, error } = await sb.from("study_groups").select("id").eq("code", normaliseCode(code)).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!group) throw new HttpError(404, "This study link isn't valid.");

  const { count } = await sb.from("participants").select("id", { count: "exact", head: true }).eq("group_id", group.id);
  if ((count ?? 0) >= MAX_PARTICIPANTS) throw new HttpError(403, "This group is full.");

  const accessCode = newAccessCode();
  const { error: insertError } = await sb.from("participants").insert({
    group_id: group.id,
    pseudonym: body.pseudonym,
    access_code_hash: hashAccessCode(accessCode),
    consent: {
      version: CONSENT_VERSION,
      items: Object.fromEntries(CONSENT_ITEMS.map((i) => [i.id, true])),
      agreedAt: new Date().toISOString(),
    },
  });
  if (insertError) {
    if (insertError.code === "23505") throw new HttpError(409, "Someone in your group already uses that name. Pick another.");
    throw new HttpError(500, insertError.message);
  }

  // Kept on a separate list with no link to the participant or their messages.
  if (body.summaryEmail) await sb.from("summary_requests").insert({ email: body.summaryEmail.toLowerCase() });

  return json({ accessCode, pseudonym: body.pseudonym });
});
