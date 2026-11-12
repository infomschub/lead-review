import Link from "next/link";
import { store } from "@/lib/store";
import { COMPANY_LABEL } from "@/lib/types";
import { tally, pct, fmtMinutes } from "@/lib/stats";
import { TallyTiles, QualityBar, RangeTabs, timeAgo } from "@/components/ui";
import { SyncButton } from "@/components/SyncButton";

export const dynamic = "force-dynamic";

export default async function Overview({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = [7, 14, 30].includes(Number((await searchParams).days)) ? Number((await searchParams).days) : 7;
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const s = store();
  const [clients, leads] = await Promise.all([s.listClients(), s.listLeads(null, since)]);
  const active = clients.filter((c) => c.active);
  const rows = active
    .map((c) => ({ c, t: tally(leads.filter((l) => l.client_id === c.id)) }))
    .sort((a, b) => b.t.total - a.t.total);
  const all = tally(leads.filter((l) => active.some((c) => c.id === l.client_id)));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">All active clients</h1>
          <p className="text-sm text-stone-500">Leads from the last {days} days. Checked automatically every Monday at 7:00 AM (PHT).</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RangeTabs days={days} base="/" />
          <SyncButton label="Sync all" />
        </div>
      </div>

      <TallyTiles t={all} />

      {rows.length === 0 ? (
        <div className="card py-12 text-center">
          <p className="font-medium">No active clients yet</p>
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
      {clients.length > active.length && (
        <p className="text-sm text-stone-500">
          {clients.length - active.length} inactive client(s) hidden:{" "}
          {clients.filter((c) => !c.active).map((c, i) => (
            <span key={c.id}>{i > 0 && ", "}<Link className="underline" href={`/clients/${c.id}`}>{c.name}</Link></span>
          ))}
        </p>
      )}
    </div>
  );
}
