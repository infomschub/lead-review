import type { Client, Lead } from "./types.ts";
import { store, isDemo } from "./store.ts";
import { fetchRecentContacts, fetchEngagement } from "./ghl.ts";
import { addressKey, fullAddress, lookupProperty } from "./property.ts";
import { gradeLead } from "./grade.ts";

export const SYNC_DAYS = 7;

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/** Pull last-7-day leads from GHL, measure roof or home, refresh engagement, grade. */
export async function syncClient(client: Client): Promise<{ leads: number; error?: string }> {
  const s = store();

  if (isDemo() || !client.ghl_token || !client.ghl_location_id) {
    // Demo/unconnected: just re-grade with the current targeting.
    const leads = await s.listLeads(client.id, new Date(Date.now() - 30 * 864e5).toISOString());
    for (const l of leads) await s.updateLead(l.id, gradeLead(client, l));
    await s.saveClient({ ...client, last_synced_at: new Date().toISOString(), last_sync_error: isDemo() ? null : "GHL not connected" });
    return { leads: leads.length };
  }

  try {
    const since = new Date(Date.now() - SYNC_DAYS * 864e5);
    const contacts = await fetchRecentContacts(client.ghl_token, client.ghl_location_id, since);
    const existing = new Map(
      (await s.getLeadsByContactIds(client.id, contacts.map((c) => c.id))).map((l) => [l.ghl_contact_id, l]),
    );

    const rows: Partial<Lead>[] = [];
    await pool(contacts, 4, async (c) => {
      const prev = existing.get(c.id);
      const row: Partial<Lead> = {
        ...(prev ?? {}),
        client_id: client.id, ghl_contact_id: c.id, name: c.name, phone: c.phone, email: c.email,
        address: c.address, city: c.city, state: c.state, zip: c.zip, source: c.source, lead_created_at: c.dateAdded,
        updated_at: new Date().toISOString(),
      };

      // Size lookup: once per address per company type (cached), retried if the last try errored.
      if (!c.address) {
        Object.assign(row, { property_status: "no_address", sqft: null, roof_sqft: null, property_type: null, lat: null, lng: null });
      } else {
        const key = `${client.company_type}:${addressKey(c)}`;
        let p = await s.getCachedProperty(key);
        if (!p || p.status === "error") {
          p = await lookupProperty(fullAddress(c), client.company_type);
          if (p.status !== "error") await s.cacheProperty(key, p);
        }
        Object.assign(row, {
          property_status: p.status, formatted_address: p.formatted_address, lat: p.lat, lng: p.lng,
          sqft: p.sqft, property_type: p.property_type, year_built: p.year_built,
          roof_sqft: p.roof_sqft, roof_pitch: p.roof_pitch, size_source: p.size_source,
          zip: c.zip || p.zip,
        });
      }

      // Engagement: refreshed every sync (conversations change daily).
      try {
        Object.assign(row, await fetchEngagement(client.ghl_token!, client.ghl_location_id, c.id), {
          engagement_checked_at: new Date().toISOString(),
        });
      } catch (e) {
        console.error("engagement", c.id, e);
      }

      Object.assign(row, gradeLead(client, row as Lead));
      delete (row as { id?: string }).id;
      rows.push(row);
    });

    await s.upsertLeads(rows);
    await s.saveClient({ ...client, last_synced_at: new Date().toISOString(), last_sync_error: null });
    return { leads: rows.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await s.saveClient({ ...client, last_sync_error: msg });
    return { leads: 0, error: msg };
  }
}

export async function syncAll() {
  const clients = (await store().listClients()).filter((c) => c.active);
  const results: Record<string, { leads: number; error?: string }> = {};
  for (const c of clients) results[c.name] = await syncClient(c);
  return results;
}
