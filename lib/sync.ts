import type { Client, Lead } from "./types.ts";
import { store, isDemo } from "./store.ts";
import { fetchRecentContacts, fetchEngagement, fetchBookings, fetchPipelines, type Appt, type Pipeline } from "./ghl.ts";
import { addressKey, fullAddress, lookupProperty } from "./property.ts";
import { gradeLead } from "./grade.ts";

/** Weekly run: last 7 days. "Sync now" on a client, or a client's first sync: last 30 days (fills the 14/30-day views). */
export const SYNC_DAYS = 7;
export const BACKFILL_DAYS = 30;

/** Turn GHL's "not authorized for this scope" into what to tick on the Private Integration. */
function scopeHint(err: string) {
  if (!/not authorized for this scope|401/i.test(err)) return "";
  if (err.startsWith("Replies")) return "Token needs Conversations + Conversation Messages read access. ";
  if (err.startsWith("Appointments")) return "Token needs Calendar Events read access. ";
  if (err.startsWith("Opportunities")) return "Token needs Opportunities read access. ";
  return "";
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/** Pull last-7-day leads from GHL, measure roof or home, refresh engagement, grade. */
export async function syncClient(client: Client, days?: number): Promise<{ leads: number; error?: string }> {
  const s = store();

  if (isDemo() || !client.ghl_token || !client.ghl_location_id) {
    // Demo/unconnected: just re-grade with the current targeting.
    const leads = await s.listLeads(client.id, new Date(Date.now() - 30 * 864e5).toISOString());
    for (const l of leads) await s.updateLead(l.id, gradeLead(client, l));
    await s.saveClient({ ...client, last_synced_at: new Date().toISOString(), last_sync_error: isDemo() ? null : "GHL not connected" });
    return { leads: leads.length };
  }

  try {
    const window = days ?? (client.last_synced_at ? SYNC_DAYS : BACKFILL_DAYS);
    const since = new Date(Date.now() - window * 864e5);
    const contacts = await fetchRecentContacts(client.ghl_token, client.ghl_location_id, since);
    // Problems that don't stop the sync but the team should see on the client page.
    const warnings = new Set<string>();
    let pipelines: Pipeline[] | null = null;
    try {
      pipelines = await fetchPipelines(client.ghl_token, client.ghl_location_id);
    } catch (e) {
      console.error("pipelines", e);
      warnings.add(`Opportunities read failed, so pipeline "Booked" stages aren't counted (${e instanceof Error ? e.message.slice(0, 120) : e}). Give the token Opportunities read access.`);
    }
    let bookings: Map<string, Appt[]> | null = null;
    try {
      bookings = await fetchBookings(client.ghl_token, client.ghl_location_id, since);
    } catch (e) {
      console.error("bookings sweep", e);
      warnings.add(`Calendar read failed, used per-contact appointments instead (${e instanceof Error ? e.message.slice(0, 120) : e}). Check the token has Calendars + Calendar Events read access.`);
    }
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
      if (!c.address && !c.city && !c.zip) {
        Object.assign(row, { property_status: "no_address", sqft: null, roof_sqft: null, property_type: null, lat: null, lng: null });
      } else {
        // v2: lookups now refuse to measure when only the street/city/ZIP was found.
        // A lead with just a city or ZIP is still placed on the map for the area check.
        const key = `v2:${client.company_type}:${addressKey(c)}`;
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
      const { fields, errors } = await fetchEngagement(client.ghl_token!, client.ghl_location_id, c.id, bookings, pipelines);
      Object.assign(row, fields, { engagement_checked_at: new Date().toISOString() });
      for (const err of errors) warnings.add(`${scopeHint(err)}${err}`);

      Object.assign(row, gradeLead(client, row as Lead));
      delete (row as { id?: string }).id;
      rows.push(row);
    });

    await s.upsertLeads(rows);
    await s.saveClient({
      ...client,
      last_synced_at: new Date().toISOString(),
      last_sync_error: warnings.size ? [...warnings].join(" · ") : null,
    });
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
