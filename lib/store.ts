import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Client, Lead, PropertyResult } from "./types.ts";
import { demoData } from "./demo.ts";

/**
 * Storage. Uses Supabase when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set,
 * otherwise an in-memory demo store seeded with sample clients and leads.
 */
export interface Store {
  listClients(): Promise<Client[]>;
  getClient(id: string): Promise<Client | null>;
  saveClient(c: Partial<Client> & { name: string }): Promise<Client>;
  deleteClient(id: string): Promise<void>;
  listLeads(clientId: string | null, sinceIso: string): Promise<Lead[]>;
  getLeadsByContactIds(clientId: string, ids: string[]): Promise<Lead[]>;
  upsertLeads(rows: Partial<Lead>[]): Promise<void>;
  updateLead(id: string, patch: Partial<Lead>): Promise<void>;
  getCachedProperty(key: string): Promise<PropertyResult | null>;
  cacheProperty(key: string, p: PropertyResult): Promise<void>;
}

export const isDemo = () => !(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

// ---------- Supabase ----------
class SupabaseStore implements Store {
  db: SupabaseClient;
  constructor() {
    // Accept the URL with or without a trailing slash or /rest/v1 on the end.
    const url = process.env.SUPABASE_URL!.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "").replace(/\/+$/, "");
    this.db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(), {
      auth: { persistSession: false },
    });
  }
  private check<T>(r: { data: T; error: { message: string } | null }): T {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  }
  async listClients() {
    return this.check(await this.db.from("clients").select("*").order("name")) as Client[];
  }
  async getClient(id: string) {
    return this.check(await this.db.from("clients").select("*").eq("id", id).maybeSingle()) as Client | null;
  }
  async saveClient(c: Partial<Client> & { name: string }) {
    return this.check(await this.db.from("clients").upsert(c).select().single()) as Client;
  }
  async deleteClient(id: string) {
    this.check(await this.db.from("clients").delete().eq("id", id));
  }
  async listLeads(clientId: string | null, sinceIso: string) {
    let q = this.db.from("leads").select("*").gte("lead_created_at", sinceIso).order("lead_created_at", { ascending: false }).limit(5000);
    if (clientId) q = q.eq("client_id", clientId);
    return this.check(await q) as Lead[];
  }
  async getLeadsByContactIds(clientId: string, ids: string[]) {
    if (!ids.length) return [];
    return this.check(await this.db.from("leads").select("*").eq("client_id", clientId).in("ghl_contact_id", ids)) as Lead[];
  }
  async upsertLeads(rows: Partial<Lead>[]) {
    for (let i = 0; i < rows.length; i += 200) {
      this.check(await this.db.from("leads").upsert(rows.slice(i, i + 200), { onConflict: "client_id,ghl_contact_id", defaultToNull: false }));
    }
  }
  async updateLead(id: string, patch: Partial<Lead>) {
    this.check(await this.db.from("leads").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id));
  }
  async getCachedProperty(key: string) {
    const row = this.check(await this.db.from("property_cache").select("*").eq("address_key", key).maybeSingle()) as
      | (PropertyResult & { address_key: string })
      | null;
    return row ? { ...row, status: row.status } : null;
  }
  async cacheProperty(key: string, p: PropertyResult) {
    this.check(await this.db.from("property_cache").upsert({ address_key: key, ...p }));
  }
}

// ---------- In-memory demo ----------
class MemoryStore implements Store {
  clients: Client[];
  leads: Lead[];
  cache = new Map<string, PropertyResult>();
  constructor() {
    const d = demoData();
    this.clients = d.clients;
    this.leads = d.leads;
  }
  async listClients() {
    return [...this.clients].sort((a, b) => a.name.localeCompare(b.name));
  }
  async getClient(id: string) {
    return this.clients.find((c) => c.id === id) ?? null;
  }
  async saveClient(c: Partial<Client> & { name: string }) {
    const existing = c.id ? this.clients.find((x) => x.id === c.id) : undefined;
    if (existing) {
      Object.assign(existing, c);
      return existing;
    }
    const created: Client = {
      id: crypto.randomUUID(), company_type: "roofing", active: true, ghl_location_id: "", ghl_token: null, target_zips: [],
      center_address: null, center_lat: null, center_lng: null, radius_miles: null, min_sqft: null,
      max_sqft: null, allowed_property_types: [], notes: null, last_synced_at: null, last_sync_error: null,
      created_at: new Date().toISOString(), ...c,
    };
    this.clients.push(created);
    return created;
  }
  async deleteClient(id: string) {
    this.clients = this.clients.filter((c) => c.id !== id);
    this.leads = this.leads.filter((l) => l.client_id !== id);
  }
  async listLeads(clientId: string | null, sinceIso: string) {
    return this.leads
      .filter((l) => (!clientId || l.client_id === clientId) && l.lead_created_at >= sinceIso)
      .sort((a, b) => b.lead_created_at.localeCompare(a.lead_created_at));
  }
  async getLeadsByContactIds(clientId: string, ids: string[]) {
    return this.leads.filter((l) => l.client_id === clientId && ids.includes(l.ghl_contact_id));
  }
  async upsertLeads(rows: Partial<Lead>[]) {
    for (const r of rows) {
      const ex = this.leads.find((l) => l.client_id === r.client_id && l.ghl_contact_id === r.ghl_contact_id);
      if (ex) Object.assign(ex, r);
      else this.leads.push({ ...(r as Lead), id: crypto.randomUUID() });
    }
  }
  async updateLead(id: string, patch: Partial<Lead>) {
    const l = this.leads.find((x) => x.id === id);
    if (l) Object.assign(l, patch, { updated_at: new Date().toISOString() });
  }
  async getCachedProperty(key: string) {
    return this.cache.get(key) ?? null;
  }
  async cacheProperty(key: string, p: PropertyResult) {
    this.cache.set(key, p);
  }
}

const g = globalThis as unknown as { __leadStore?: Store };
export function store(): Store {
  if (!g.__leadStore) g.__leadStore = isDemo() ? new MemoryStore() : new SupabaseStore();
  return g.__leadStore;
}
