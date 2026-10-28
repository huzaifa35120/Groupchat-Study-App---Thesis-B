import { predictionsCsv, reportMarkdown, sessionsCsv, transcriptsCsv } from "@/lib/analysis/export";
import { buildReport } from "@/lib/analysis/report";
import { requireResearcher } from "@/lib/auth";
import { HttpError, route } from "@/lib/http";
import { loadReportInput } from "@/lib/report-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function file(body: string, name: string, type: string) {
  return new Response(body, {
    headers: {
      "Content-Type": `${type}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const GET = route(async (req) => {
  await requireResearcher();
  const params = new URL(req.url).searchParams;
  const kind = params.get("kind");
  const input = await loadReportInput();
  const report = buildReport(input, { runId: params.get("run"), source: params.get("source") });
  const stamp = new Date().toISOString().slice(0, 10);

  switch (kind) {
    case "predictions":
      return file(predictionsCsv(report), `gaps-${stamp}.csv`, "text/csv");
    case "sessions":
      return file(sessionsCsv(report), `sessions-${stamp}.csv`, "text/csv");
    case "transcripts": {
      const labels = new Map<string, string>();
      const byGroup = new Map<string, string[]>();
      for (const p of input.participants) byGroup.set(p.group_id, [...(byGroup.get(p.group_id) ?? []), p.id]);
      for (const ids of byGroup.values()) ids.forEach((id, i) => labels.set(id, `P${i + 1}`));
      return file(
        transcriptsCsv(report, input.messages, (id) => (id ? labels.get(id) ?? "P?" : "")),
        `transcripts-${stamp}.csv`,
        "text/csv",
      );
    }
    case "markdown":
      return file(reportMarkdown(report), `results-${stamp}.md`, "text/markdown");
    case "json":
      return file(JSON.stringify(report, null, 2), `results-${stamp}.json`, "application/json");
    default:
      throw new HttpError(400, "Unknown export kind.");
  }
});
