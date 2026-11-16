import Link from "next/link";
import { store } from "@/lib/store";
import { CLIENT_STATUSES, COMPANY_LABEL, statusOf } from "@/lib/types";
import { tally, pct, fmtMinutes } from "@/lib/stats";
import { QualityBar, RangeTabs, timeAgo } from "@/components/ui";
import { SyncButton } from "@/components/SyncButton";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function Overview({ searchParams }: { searchParams: Promise<{ days?: string; status?: string }> }) {
  const sp = await searchParams;
  const days = [7, 14, 30].includes(Number(sp.days)) ? Number(sp.days) : 7;
  const status = statusOf(sp.status);
  const label = CLIENT_STATUSES.find((x) => x.key === status)!.label;
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const s = store();
  const [clients, leads] = await Promise.all([s.listClients(), s.listLeads(null, since)]);
  const rows = clients
    .filter((c) => (c.status ?? "active") === status)
    .map((c) => ({ c, t: tally(leads.filter((l) => l.client_id === c.id)) }))
    .sort((a, b) => b.t.total - a.t.total);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{label} clients</h1>
          <p className="text-sm text-stone-500">
            Each client&apos;s leads from the last {days} days.{" "}
            {status === "active" ? "Checked automatically every Monday at 7:00 AM (PHT)." : "Not synced while " + status + "."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-lg border border-stone-300 bg-white p-0.5 text-sm">
            {CLIENT_STATUSES.map((x) => (
              <Link
                key={x.key}
                href={`/?status=${x.key}&days=${days}`}
                className={`rounded-md px-3 py-1 ${x.key === status ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"}`}
              >
                {x.label}
              </Link>
            ))}
          </div>
          <RangeTabs days={days} base="/" extra={`status=${status}`} />
          {status === "active" && <SyncButton label="Sync all" />}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card py-12 text-center">
          <p className="font-medium">No {status} clients</p>
          <p className="mt-1 text-sm text-stone-500">Add a client and set their targeting to start reviewing leads.</p>
          <Link href="/clients/new" className="btn-primary mt-4">+ Add client</Link>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3">Client</th>
                <th className="px-3 py-3 text-right">Leads</th>
                <th className="px-3 py-3 w-48">Quality</th>
                <th className="px-3 py-3 text-right">Good</th>
                <th className="px-3 py-3 text-right">Bad</th>
                <th className="px-3 py-3 text-right">Review</th>
                <th className="px-3 py-3 text-right">Responsive</th>
                <th className="px-3 py-3 text-right">Client replied</th>
                <th className="px-3 py-3 text-right">Waiting</th>
                <th className="px-3 py-3 text-right">Booked</th>
                <th className="px-4 py-3 text-right">Synced</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map(({ c, t }) => (
                <tr key={c.id} className="hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <Link href={`/clients/${c.id}?days=${days}`} className="font-medium text-brand hover:underline">{c.name}</Link>
                    <p className="text-xs text-stone-500">{COMPANY_LABEL[c.company_type]}</p>
                    {c.last_sync_error && <p className="text-xs text-red-600" title={c.last_sync_error}>Sync problem</p>}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{t.total}</td>
                  <td className="px-3 py-3"><QualityBar t={t} /></td>
                  <td className="px-3 py-3 text-right tabular-nums text-emerald-700">{t.good} <span className="text-stone-400">({pct(t.good, t.total)}%)</span></td>
                  <td className="px-3 py-3 text-right tabular-nums text-red-700">{t.bad}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-amber-700">{t.review}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{t.responsive} <span className="text-stone-400">({pct(t.responsive, t.total)}%)</span></td>
                  <td className="px-3 py-3 text-right tabular-nums">{t.clientResponded}/{t.responsive} <span className="text-stone-400">· {fmtMinutes(t.avgResponseMinutes)}</span></td>
                  <td className={`px-3 py-3 text-right tabular-nums ${t.awaitingClient ? "font-semibold text-orange-600" : ""}`}>{t.awaitingClient}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-brand">{t.booked}</td>
                  <td className="px-4 py-3 text-right text-xs text-stone-500">{timeAgo(c.last_synced_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
