import { checksHome, checksRoof, type Client, type Grade, type Lead } from "./types.ts";

export function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const zip5 = (z: string | null | undefined) => (z ?? "").trim().slice(0, 5);

type GradeInput = Pick<
  Lead,
  "property_status" | "lat" | "lng" | "zip" | "sqft" | "roof_sqft" | "property_type" | "address" | "city"
>;

export interface GradeResult {
  grade: Grade;
  reasons: string[];
  in_area: boolean | null;
  distance_miles: number | null;
  nearest_area: string | null;
}

/** In the area if the ZIP is listed OR the home is inside ANY pin's radius. Distance is to the closest pin. */
export function checkArea(client: Client, lead: Pick<Lead, "lat" | "lng" | "zip">) {
  const zips = client.target_zips.map(zip5);
  const pins = (client.areas ?? []).filter((a) => a.radius_miles > 0);

  let distance: number | null = null;
  let nearest: string | null = null;
  let insidePin = false;
  if (pins.length && lead.lat != null && lead.lng != null) {
    for (const a of pins) {
      const d = Math.round(haversineMiles(a.lat, a.lng, lead.lat, lead.lng) * 10) / 10;
      if (d <= a.radius_miles) insidePin = true;
      if (distance == null || d < distance) [distance, nearest] = [d, a.label];
    }
  }
  if (!zips.length && !pins.length) return { in_area: true as boolean | null, distance, nearest };

  const zipOk = zips.length > 0 && !!lead.zip && zips.includes(zip5(lead.zip));
  const unknown = !lead.zip && distance == null;
  return { in_area: unknown ? null : zipOk || insidePin, distance, nearest };
}

export function gradeLead(client: Client, lead: GradeInput): GradeResult {
  const bad: string[] = [];
  const review: string[] = [];
  const incompleteGrade: Grade = client.incomplete_as === "bad" ? "bad" : "review";

  const area = checkArea(client, lead);
  const base = { in_area: area.in_area, distance_miles: area.distance, nearest_area: area.nearest };
  const pinName = (n: string | null) => (n ? ` from ${n}` : "");

  if (area.in_area === false) {
    bad.push(
      area.distance != null
        ? `Outside service area (${area.distance} mi${pinName(area.nearest)})`
        : `Outside service area (ZIP ${lead.zip})`,
    );
  }

  // Missing or partial address: judge the area if we can place it, otherwise apply the client's setting.
  if (lead.property_status === "no_address" || lead.property_status === "incomplete" || !lead.address) {
    const what = !lead.address
      ? lead.city || lead.zip
        ? "No street address (only city/ZIP)"
        : "No address on the lead"
      : "Incomplete address, can't find the exact house";
    if (bad.length) return { grade: "bad", reasons: [...bad, what], ...base };
    return { grade: incompleteGrade, reasons: [what], ...base };
  }

  if (area.in_area === null) review.push("Couldn't place the address on a map");

  const roof = checksRoof(client.company_type);
  const home = checksHome(client.company_type);
  const limit = (what: string, size: number | null, min: number | null, max: number | null) => {
    if (min == null && max == null) return;
    if (size == null) return review.push(`${what} size not found`);
    if (min != null && size < min) bad.push(`${what} too small (${size.toLocaleString()} sq ft, min ${min.toLocaleString()})`);
    if (max != null && size > max) bad.push(`${what} too large (${size.toLocaleString()} sq ft, max ${max.toLocaleString()})`);
  };
  if (lead.property_status === "found") {
    const allowed = client.allowed_property_types;
    if (home && lead.property_type && allowed.length > 0 && !allowed.includes(lead.property_type)) {
      bad.push(`Property type: ${lead.property_type}`);
    }
    if (roof) limit("Roof", lead.roof_sqft, client.min_roof_sqft, client.max_roof_sqft);
    if (home) limit("Home", lead.sqft, client.min_sqft, client.max_sqft);
  } else if (lead.property_status === "not_found") {
    review.push(roof && home ? "No roof or home data for this address" : roof ? "No roof data for this address" : "Home not found on Redfin or Zillow");
  } else if (lead.property_status === "error") {
    review.push("Lookup failed, will retry next run");
  } else if (lead.property_status === "pending") {
    review.push("Property lookup pending");
  }

  if (bad.length) return { grade: "bad", reasons: [...bad, ...review], ...base };
  if (review.length) return { grade: "review", reasons: review, ...base };
  return { grade: "good", reasons: ["Meets targeting"], ...base };
}
