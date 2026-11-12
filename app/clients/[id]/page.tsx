import Link from "next/link";
import { notFound } from "next/navigation";
import { store } from "@/lib/store";
import { tally } from "@/lib/stats";
import { TallyTiles, RangeTabs, timeAgo } from "@/components/ui";
import { SyncButton } from "@/components/SyncButton";
import { LeadsTable } from "@/components/LeadsTable";
import { COMPANY_LABEL, type Client } from "@/lib/types";

export const dynamic = "force-dynamic";

function targetingSummary(c: Client) {
  const parts: string[] = [COMPANY_LABEL[c.company_type]];
  const what = c.company_type === "roofing" ? "roof" : "home";
  if (c.center_address && c.radius_miles) parts.push(`Within ${c.radius_miles} mi of ${c.center_address}`);
  if (c.target_zips.length) parts.push(`${c.target_zips.length} ZIP code${c.target_zips.length === 1 ? "" : "s"}`);
  if (parts.length === 1) parts.push("Any location");
  if (c.min_sqft && c.max_sqft) parts.push(`${c.min_sqft.toLocaleString()}–${c.max_sqft.toLocaleString()} sq ft ${what}`);
  else if (c.min_sqft) parts.push(`${c.min_sqft.toLocaleString()}+ sq ft ${what}`);
  else if (c.max_sqft) parts.push(`Up to ${c.max_sqft.toLocaleString()} sq ft ${what}`);
  if (c.company_type === "home_improvement")
    parts.push(c.allowed_property_types.length ? c.allowed_property_types.join(" / ") : "Any property type");
  return parts;
}

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { id } = await params;
  const d = Number((await searchParams).days);
  const days = [7, 14, 30].includes(d) ? d : 7;
  const s = store();
  const client = await s.getClient(id);
  if (!client) notFound();
  const leads = await s.listLeads(id, new Date(Date.now() - days * 864e5).toISOString());
  const t = tally(leads);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/?days=${days}`} className="text-sm text-stone-500 hover:underline">← All clients</Link>
          <h1 className="mt-1 text-2xl font-semibold">
            {client.name}
            {!client.active && <span className="pill ml-2 bg-stone-200 align-middle text-stone-600">Inactive</span>}
          </h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {targetingSummary(client).map((p) => (
              <span key={p} className="pill bg-brand-soft text-brand-dark">{p}</span>
            ))}
          </div>
          <p className="mt-2 text-xs text-stone-500">
            Last synced {timeAgo(client.last_synced_at)}
            {client.last_sync_error && <span className="text-red-600"> · {client.last_sync_error}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RangeTabs days={days} base={`/clients/${id}`} />
          <Link href={`/clients/${id}/settings`} className="btn-ghost">Targeting</Link>
          <SyncButton clientId={id} />
        </div>
      </div>

      <TallyTiles t={t} />
      <LeadsTable leads={leads} clientId={id} clientName={client.name} companyType={client.company_type} />
    </div>
  );
}
