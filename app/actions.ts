"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { store, isDemo } from "@/lib/store";
import { syncAll, syncClient } from "@/lib/sync";
import { geocode } from "@/lib/property";
import { testConnection } from "@/lib/ghl";
import { gradeLead } from "@/lib/grade";
import type { Client, CompanyType, Grade } from "@/lib/types";

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

  const centerAddress = String(formData.get("center_address") ?? "").trim() || null;
  let center_lat = prev?.center_lat ?? null;
  let center_lng = prev?.center_lng ?? null;
  if (!centerAddress) {
    center_lat = center_lng = null;
  } else if (centerAddress !== prev?.center_address || center_lat == null) {
    const latIn = num(formData.get("center_lat"));
    const lngIn = num(formData.get("center_lng"));
    const g = await geocode(centerAddress);
    if (g) [center_lat, center_lng] = [g.lat, g.lng];
    else if (latIn != null && lngIn != null) [center_lat, center_lng] = [latIn, lngIn];
    else return { error: "Couldn't find that center address. Add a Google Maps key, or enter latitude/longitude." };
  }

  const company_type: CompanyType = formData.get("company_type") === "home_improvement" ? "home_improvement" : "roofing";
  const tokenIn = String(formData.get("ghl_token") ?? "").trim();
  const client: Partial<Client> & { name: string } = {
    ...(id ? { id } : {}),
    name,
    company_type,
    active: formData.get("active") === "on",
    ghl_location_id: String(formData.get("ghl_location_id") ?? "").trim(),
    // Blank token field on edit = keep the saved one.
    ghl_token: tokenIn || prev?.ghl_token || null,
    target_zips: String(formData.get("target_zips") ?? "")
      .split(/[\s,;]+/)
      .map((z) => z.trim().slice(0, 5))
      .filter((z) => /^\d{5}$/.test(z)),
    center_address: centerAddress,
    center_lat,
    center_lng,
    radius_miles: centerAddress ? num(formData.get("radius_miles")) : null,
    min_sqft: num(formData.get("min_sqft")),
    max_sqft: num(formData.get("max_sqft")),
    allowed_property_types: company_type === "roofing" ? [] : formData.getAll("allowed_property_types").map(String),
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
  const saved = await s.saveClient(client);

  // Re-grade existing leads against the new targeting right away.
  const leads = await s.listLeads(saved.id, new Date(Date.now() - 90 * 864e5).toISOString());
  for (const l of leads) await s.updateLead(l.id, gradeLead(saved, l));

  revalidatePath("/");
  redirect(`/clients/${saved.id}`);
}

export async function deleteClient(formData: FormData) {
  await store().deleteClient(String(formData.get("id")));
  revalidatePath("/");
  redirect("/");
}

export async function syncNow(clientId?: string) {
  if (clientId) {
    const c = await store().getClient(clientId);
    if (c) await syncClient(c);
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
