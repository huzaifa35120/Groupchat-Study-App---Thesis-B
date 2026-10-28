"use client";
import { Button, Card, Empty, Notice, PageHeader, Spinner } from "@/components/ui";
import { api, useApi } from "@/lib/client";
import { dateTime } from "@/lib/format";

interface DataResponse {
  summaryRequests: { id: string; email: string; created_at: string }[];
  withdrawals: { id: string; group_name: string | null; sessions_deleted: number; messages_deleted: number; initiated_by: string; created_at: string }[];
}

export default function DataPage() {
  const { data, error, reload } = useApi<DataResponse>("/api/admin/data");

  return (
    <>
      <PageHeader title="Data & ethics" description="What is stored, who can see it, and the lists you need to manage." />
      {error && <Notice tone="error">{error}</Notice>}
      {!data && !error && <div className="flex items-center gap-2 text-sm text-stone-500"><Spinner /> Loading…</div>}
      {data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card
            title="Results-summary emails"
            description="Optional emails from the consent page. Stored separately and never linked to participants or messages."
            actions={
              data.summaryRequests.length > 0 && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={async () => {
                    if (!confirm("Delete every email on this list? Do this once the summaries have been sent.")) return;
                    await api("/api/admin/data", { method: "DELETE" });
                    void reload();
                  }}
                >
                  Delete all
                </Button>
              )
            }
          >
            {data.summaryRequests.length === 0 ? (
              <Empty>No requests.</Empty>
            ) : (
              <>
                <ul className="space-y-1 text-sm">
                  {[...data.summaryRequests].sort((a, b) => a.email.localeCompare(b.email)).map((r) => <li key={r.id} className="font-mono">{r.email}</li>)}
                </ul>
                <p className="mt-3 text-xs text-stone-500">Shown alphabetically so the order can&apos;t be matched to join times.</p>
              </>
            )}
          </Card>

          <Card title="Withdrawals" description="Anonymous log: no names or codes are kept.">
            {data.withdrawals.length === 0 ? (
              <Empty>No withdrawals.</Empty>
            ) : (
              <table className="data">
                <thead><tr><th>When</th><th>Group</th><th className="num">Sessions deleted</th><th className="num">Messages deleted</th><th>By</th></tr></thead>
                <tbody>
                  {data.withdrawals.map((w) => (
                    <tr key={w.id}><td>{dateTime(w.created_at)}</td><td>{w.group_name ?? "–"}</td><td className="num">{w.sessions_deleted}</td><td className="num">{w.messages_deleted}</td><td>{w.initiated_by}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="What is stored" className="lg:col-span-2">
            <div className="grid gap-6 text-sm text-stone-700 md:grid-cols-3">
              <div>
                <h3 className="font-medium text-stone-900">Collected</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  <li>Made-up name, message text and timestamps</li>
                  <li>Consent ticks with the time they were given</li>
                  <li>A hash of each participant&apos;s access code (the code itself is never stored)</li>
                  <li>Moderator messages, flagged and excluded from analysis</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-stone-900">Not collected</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  <li>Real names, student numbers, demographics</li>
                  <li>IP addresses or device information (nothing is written to the database)</li>
                  <li>Emails, except the optional unlinked summary list above</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-stone-900">Access</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  <li>Row-level security on every table; only signed-in researchers listed in ADMIN_EMAILS</li>
                  <li>Only message text and made-up names (or Speaker 1/2/3) are sent to the Anthropic API</li>
                  <li>Realtime only carries &ldquo;new message&rdquo; pings, typing and presence — never message text</li>
                </ul>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
