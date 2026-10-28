import { requireResearcher } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { loadReport } from "@/lib/report-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = route(async (req) => {
  await requireResearcher();
  const params = new URL(req.url).searchParams;
  return json(await loadReport(params.get("run"), params.get("source")));
});
