"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { store, isDemo } from "@/lib/store";
import { syncAll, syncClient } from "@/lib/sync";
import { geocode, lastGeocodeError, parseLatLng } from "@/lib/property";
import { testConnection } from "@/lib/ghl";
import { gradeLead } from "@/lib/grade";
import { statusOf, type Area, type Client, type CompanyType, type Grade } from "@/lib/types";

export async function login(formData: FormData) {
  const pw = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/") || "/";
  if (pw !== process.env.DASHBOARD_PASSWORD) redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  (await cookies()).set("lr_auth", pw, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
  redirect(next.startsWith("/") ? next : "/");
}

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(/,/g, "").trim();
  return s === "" || isNaN(Number(s)) ? null : Number(s);
};

export async function saveClient(_: unknown, formData: FormData): Promise<{ error?: string }> {
  const s = store();
  const id = String(formData.get("id") ?? "") || undefined;
  const prev = id ? await s.getClient(id) : null;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Client name is required." };

  // Pins: each row is a city/address or "lat, lng" from a Facebook pin, plus a radius in miles.
  const labels = formData.getAll("pin_label").map((v) => String(v).trim());
  const radii = formData.getAll("pin_radius").map((v) => num(v));
  const areas: Area[] = [];
  for (let k = 0; k < labels.length; k++) {
    const label = labels[k];
    if (!label) continue;
    const radius = radii[k];
    if (radius == null || radius <= 0) return { error: `Add a radius (miles) for the pin "${label}".` };
    const same = prev?.areas?.find((a) => a.label === label);
    const coords = parseLatLng(label) ?? (same ? { lat: same.lat, lng: same.lng } : null);
    if (coords) {
      areas.push({ label, ...coords, radius_miles: radius });
      continue;
    }
    if (!process.env.GOOGLE_MAPS_API_KEY)
      return { error: `Couldn't place "${label}": GOOGLE_MAPS_API_KEY isn't set. Paste the pin's coordinates instead (e.g. 39.7392, -104.9903).` };
    const g = await geocode(label);
    if (!g) return { error: `Couldn't place "${label}". Google said: ${lastGeocodeError ?? "no result"}. You can paste the pin's coordinates instead.` };
    areas.push({ label, lat: g.lat, lng: g.lng, radius_miles: radius });
  }

  const ct = String(formData.get("company_type") ?? "");
  const company_type: CompanyType = ct === "home_improvement" || ct === "both" ? ct : "roofing";
  const roof = company_type !== "home_improvement";
  const home = company_type !== "roofing";
  const tokenIn = String(formData.get("ghl_token") ?? "").trim();
  const client: Partial<Client> & { name: string } = {
    ...(id ? { id } : {}),
    name,
    company_type,
    status: statusOf(formData.get("status")),
    ghl_location_id: String(formData.get("ghl_location_id") ?? "").trim(),
    // Blank token field on edit = keep the saved one.
    ghl_token: tokenIn || prev?.ghl_token || null,
    target_zips: String(formData.get("target_zips") ?? "")
      .split(/[\s,;]+/)
      .map((z) => z.trim().slice(0, 5))
      .filter((z) => /^\d{5}$/.test(z)),
    areas,
    incomplete_as: formData.get("incomplete_as") === "bad" ? "bad" : "review",
    min_sqft: home ? num(formData.get("min_sqft")) : null,
    max_sqft: home ? num(formData.get("max_sqft")) : null,
    min_roof_sqft: roof ? num(formData.get("min_roof_sqft")) : null,
    max_roof_sqft: roof ? num(formData.get("max_roof_sqft")) : null,
    allowed_property_types: home ? formData.getAll("allowed_property_types").map(String) : [],
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
  const saved = await s.saveClient(client);

  // Re-grade existing leads against the new targeting right away.
  const leads = await s.listLeads(saved.id, new Date(Date.now() - 90 * 864e5).toISOString());
  for (const l of leads) await s.updateLead(l.id, gradeLead(saved, l));

  revalidatePath("/", "layout");
  redirect(`/clients/${saved.id}`);
}

export async function deleteClient(formData: FormData) {
  await store().deleteClient(String(formData.get("id")));
  revalidatePath("/", "layout");
  redirect("/");
}

export async function syncNow(clientId?: string) {
  if (clientId) {
    const c = await store().getClient(clientId);
    if (c) await syncClient(c, 30);
  } else {
    await syncAll();
  }
  revalidatePath("/", "layout");
}

export async function overrideLead(leadId: string, grade: Grade | null, note: string | null, clientId: string) {
  await store().updateLead(leadId, { override_grade: grade, override_note: note });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/");
}

export async function testGhl(token: string, locationId: string, clientId?: string) {
  if (isDemo()) return { ok: false, message: "Demo mode: connect Supabase first." };
  let t = token.trim();
  if (!t && clientId) t = (await store().getClient(clientId))?.ghl_token ?? "";
  if (!t || !locationId.trim()) return { ok: false, message: "Enter the location ID and token." };
  try {
    const n = await testConnection(t, locationId.trim());
    return { ok: true, message: `Connected. ${n} lead${n === 1 ? "" : "s"} in the last 7 days.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
