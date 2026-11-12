import type { PropertyResult } from "./types.ts";

/**
 * Home size lookup.
 * 1. RentCast property records (square footage, property type, year built, lat/lng).
 * 2. If the address isn't in property records, Google Geocoding still places it on the map
 *    so the service-area check works.
 */
export function addressKey(parts: { address: string | null; city?: string | null; state?: string | null; zip?: string | null }) {
  return [parts.address, parts.city, parts.state, parts.zip]
    .filter(Boolean)
    .join(", ")
    .toLowerCase()
    .replace(/[.#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function fullAddress(parts: { address: string | null; city?: string | null; state?: string | null; zip?: string | null }) {
  const cityLine = [parts.city, [parts.state, parts.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [parts.address, cityLine].filter(Boolean).join(", ");
}

const RENTCAST_TYPES: Record<string, string> = {
  "single family": "Single Family",
  townhouse: "Townhouse",
  condo: "Condo",
  "multi-family": "Multi-Family",
  manufactured: "Manufactured",
  apartment: "Apartment",
  land: "Land",
};

async function rentcast(address: string): Promise<PropertyResult | null> {
  const key = process.env.RENTCAST_API_KEY;
  if (!key) return null;
  const res = await fetch(`https://api.rentcast.io/v1/properties?address=${encodeURIComponent(address)}`, {
    headers: { "X-Api-Key": key, Accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`RentCast ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  const p = rows?.[0];
  if (!p) return null;
  const t = String(p.propertyType ?? "").toLowerCase();
  return {
    status: "found",
    formatted_address: (p.formattedAddress as string) ?? address,
    lat: (p.latitude as number) ?? null,
    lng: (p.longitude as number) ?? null,
    zip: (p.zipCode as string) ?? null,
    sqft: (p.squareFootage as number) ?? null,
    property_type: RENTCAST_TYPES[t] ?? ((p.propertyType as string) || null),
    year_built: (p.yearBuilt as number) ?? null,
  };
}

export async function geocode(address: string) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`,
    { cache: "no-store" },
  );
  const data = (await res.json()) as {
    status: string;
    results: { formatted_address: string; geometry: { location: { lat: number; lng: number } }; address_components: { types: string[]; short_name: string }[] }[];
  };
  const r = data.results?.[0];
  if (data.status !== "OK" || !r) return null;
  return {
    formatted_address: r.formatted_address,
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    zip: r.address_components.find((c) => c.types.includes("postal_code"))?.short_name ?? null,
  };
}

export async function lookupProperty(address: string): Promise<PropertyResult> {
  const empty: PropertyResult = {
    status: "not_found", formatted_address: null, lat: null, lng: null, zip: null, sqft: null, property_type: null, year_built: null,
  };
  try {
    const rc = await rentcast(address);
    if (rc) return rc;
    const g = await geocode(address);
    return g ? { ...empty, ...g } : empty;
  } catch (e) {
    console.error("property lookup", e);
    return { ...empty, status: "error" };
  }
}

export const propertyLookupConfigured = () => !!process.env.RENTCAST_API_KEY;
