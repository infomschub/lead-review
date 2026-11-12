import type { CompanyType, PropertyResult } from "./types.ts";

/**
 * Size lookup, by company type:
 *  - Roofing: Google Geocoding -> Google Solar building insights -> whole-roof area (sq ft) and average pitch.
 *  - Home improvement: scrape the listing page (Redfin first, Zillow as fallback) for living area,
 *    property type and year built. Google Geocoding still places the home for the service-area check.
 *
 * Listing sites block cloud servers, so the scrape goes through ScraperAPI when SCRAPER_API_KEY is set.
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

const EMPTY: PropertyResult = {
  status: "not_found", formatted_address: null, lat: null, lng: null, zip: null, sqft: null,
  property_type: null, year_built: null, roof_sqft: null, roof_pitch: null, size_source: null,
};

// ---------- Google ----------
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

const M2_TO_SQFT = 10.7639;

export async function solarRoof(lat: number, lng: number) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  for (const quality of ["HIGH", "MEDIUM", "LOW"]) {
    const res = await fetch(
      `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&requiredQuality=${quality}&key=${key}`,
      { cache: "no-store" },
    );
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`Google Solar ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const d = (await res.json()) as {
      solarPotential?: {
        wholeRoofStats?: { areaMeters2?: number };
        roofSegmentStats?: { pitchDegrees?: number; stats?: { areaMeters2?: number } }[];
      };
    };
    const area = d.solarPotential?.wholeRoofStats?.areaMeters2;
    if (!area) continue;
    const segs = d.solarPotential?.roofSegmentStats ?? [];
    const segArea = segs.reduce((a, s) => a + (s.stats?.areaMeters2 ?? 0), 0);
    const pitch = segArea
      ? segs.reduce((a, s) => a + (s.pitchDegrees ?? 0) * (s.stats?.areaMeters2 ?? 0), 0) / segArea
      : null;
    return { roof_sqft: Math.round(area * M2_TO_SQFT), roof_pitch: pitch == null ? null : Math.round(pitch) };
  }
  return null;
}

// ---------- Scrape ----------
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

async function scrapeFetch(url: string): Promise<string | null> {
  const key = process.env.SCRAPER_API_KEY;
  const target = key
    ? `https://api.scraperapi.com/?api_key=${key}&country_code=us&url=${encodeURIComponent(url)}`
    : url;
  const res = await fetch(target, { headers: { "User-Agent": UA, Accept: "text/html,application/json" }, cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Scrape ${res.status} for ${new URL(url).hostname}`);
  return res.text();
}

const num = (s: string | undefined) => (s ? Number(s.replace(/,/g, "")) || null : null);

const TYPE_MAP: [RegExp, string][] = [
  [/single[\s_-]?family/i, "Single Family"],
  [/town ?house/i, "Townhouse"],
  [/condo/i, "Condo"],
  [/multi[\s_-]?family|duplex|triplex|fourplex/i, "Multi-Family"],
  [/manufactured|mobile/i, "Manufactured"],
  [/apartment/i, "Apartment"],
  [/land|lot/i, "Land"],
];
const normType = (s: string | null | undefined) => (s ? TYPE_MAP.find(([re]) => re.test(s))?.[1] ?? s : null);

/** Pull home facts out of a Redfin or Zillow property page. Exported for tests. */
export function parseListing(html: string) {
  const sqft =
    num(html.match(/"livingArea"\s*:\s*(\d{3,6})/)?.[1]) ??
    num(html.match(/"sqFt"\s*:\s*\{[^}]*"value"\s*:\s*(\d{3,6})/)?.[1]) ??
    num(html.match(/"sqftInfo"\s*:\s*\{[^}]*"amount"\s*:\s*(\d{3,6})/)?.[1]) ??
    num(html.match(/([\d,]{3,7})\s*(?:<[^>]+>\s*)*(?:Sq\.?\s*Ft|sqft)/i)?.[1]);
  const type = normType(
    html.match(/"homeType"\s*:\s*"([A-Z_]+)"/)?.[1] ??
      html.match(/Property Type[^<]*<\/span>\s*<span[^>]*>([^<]+)/i)?.[1] ??
      html.match(/"propertyTypeName"\s*:\s*"([^"]+)"/)?.[1],
  );
  const year =
    num(html.match(/"yearBuilt"\s*:\s*\{?[^}\d]*?(\d{4})/)?.[1]) ??
    num(html.match(/Year Built[^<]*<\/span>\s*<span[^>]*>\s*(\d{4})/i)?.[1]) ??
    num(html.match(/Built in (\d{4})/i)?.[1]);
  return { sqft: sqft && sqft >= 300 && sqft <= 30000 ? sqft : null, property_type: type, year_built: year };
}

async function redfin(address: string) {
  const body = await scrapeFetch(
    `https://www.redfin.com/stingray/do/location-autocomplete?location=${encodeURIComponent(address)}&v=2`,
  );
  if (!body) return null;
  const json = JSON.parse(body.replace(/^\{\}&&/, "")) as {
    payload?: { exactMatch?: { url?: string }; sections?: { rows?: { url?: string; type?: string }[] }[] };
  };
  const path = json.payload?.exactMatch?.url ?? json.payload?.sections?.[0]?.rows?.find((r) => r.url?.includes("/home/"))?.url;
  if (!path?.includes("/home/")) return null;
  const html = await scrapeFetch(`https://www.redfin.com${path}`);
  if (!html) return null;
  const facts = parseListing(html);
  return facts.sqft ? { ...facts, size_source: "Redfin" } : null;
}

async function zillow(address: string) {
  const slug = address.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
  const html = await scrapeFetch(`https://www.zillow.com/homes/${slug}_rb/`);
  if (!html) return null;
  const facts = parseListing(html);
  return facts.sqft ? { ...facts, size_source: "Zillow" } : null;
}

export async function lookupProperty(address: string, type: CompanyType): Promise<PropertyResult> {
  try {
    const g = await geocode(address);
    const placed: PropertyResult = { ...EMPTY, ...(g ?? {}) };

    if (type === "roofing") {
      if (!g) return placed;
      const roof = await solarRoof(g.lat, g.lng);
      return roof ? { ...placed, ...roof, status: "found", size_source: "Google Solar" } : placed;
    }

    let home = null;
    let lastErr: unknown = null;
    for (const src of [redfin, zillow]) {
      try {
        home = await src(address);
        if (home) break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (home) return { ...placed, ...home, status: "found" };
    if (lastErr) console.error("home scrape", lastErr);
    return lastErr ? { ...placed, status: "error" } : placed;
  } catch (e) {
    console.error("property lookup", e);
    return { ...EMPTY, status: "error" };
  }
}

export const lookupConfigured = () => !!process.env.GOOGLE_MAPS_API_KEY;
