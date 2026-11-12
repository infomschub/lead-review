import { measuredSize, type Client, type Grade, type Lead } from "./types.ts";

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
  "property_status" | "lat" | "lng" | "zip" | "sqft" | "roof_sqft" | "property_type" | "address"
>;

export interface GradeResult {
  grade: Grade;
  reasons: string[];
  in_area: boolean | null;
  distance_miles: number | null;
}

/** Area check: in-area if the ZIP is listed OR the home is inside the radius. */
export function checkArea(client: Client, lead: GradeInput) {
  const hasZips = client.target_zips.length > 0;
  const hasRadius =
    client.center_lat != null && client.center_lng != null && (client.radius_miles ?? 0) > 0;

  let distance: number | null = null;
  if (hasRadius && lead.lat != null && lead.lng != null) {
    distance = Math.round(haversineMiles(client.center_lat!, client.center_lng!, lead.lat, lead.lng) * 10) / 10;
  }
  if (!hasZips && !hasRadius) return { in_area: true, distance, unknown: false };

  const zipOk = hasZips && lead.zip ? client.target_zips.map(zip5).includes(zip5(lead.zip)) : false;
  const radiusOk = distance != null ? distance <= client.radius_miles! : false;
  const unknown = !lead.zip && distance == null;
  return { in_area: unknown ? null : zipOk || radiusOk, distance, unknown };
}

export function gradeLead(client: Client, lead: GradeInput): GradeResult {
  const bad: string[] = [];
  const review: string[] = [];

  if (lead.property_status === "no_address" || !lead.address) {
    return { grade: "review", reasons: ["No address on the lead"], in_area: null, distance_miles: null };
  }

  const area = checkArea(client, lead);
  if (area.in_area === false) {
    bad.push(area.distance != null ? `Outside service area (${area.distance} mi away)` : `Outside service area (ZIP ${lead.zip})`);
  } else if (area.in_area === null) {
    review.push("Couldn't place the address on a map");
  }

  const roofing = client.company_type === "roofing";
  const what = roofing ? "Roof" : "Home";
  if (lead.property_status === "found") {
    const allowed = client.allowed_property_types;
    if (!roofing && lead.property_type && allowed.length > 0 && !allowed.includes(lead.property_type)) {
      bad.push(`Property type: ${lead.property_type}`);
    }
    const size = measuredSize(client, lead);
    if (size == null) {
      review.push(`${what} size not found`);
    } else {
      if (client.min_sqft != null && size < client.min_sqft)
        bad.push(`${what} too small (${size.toLocaleString()} sq ft, min ${client.min_sqft.toLocaleString()})`);
      if (client.max_sqft != null && size > client.max_sqft)
        bad.push(`${what} too large (${size.toLocaleString()} sq ft, max ${client.max_sqft.toLocaleString()})`);
    }
  } else if (lead.property_status === "not_found") {
    review.push(roofing ? "No roof data for this address" : "Home not found on Redfin or Zillow");
  } else if (lead.property_status === "error") {
    review.push("Lookup failed, will retry next run");
  } else if (lead.property_status === "pending") {
    review.push("Property lookup pending");
  }

  if (bad.length) return { grade: "bad", reasons: [...bad, ...review], in_area: area.in_area, distance_miles: area.distance };
  if (review.length) return { grade: "review", reasons: review, in_area: area.in_area, distance_miles: area.distance };
  return { grade: "good", reasons: ["Meets targeting"], in_area: area.in_area, distance_miles: area.distance };
}
