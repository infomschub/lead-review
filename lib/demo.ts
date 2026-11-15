import type { Client, Lead } from "./types.ts";
import { gradeLead } from "./grade.ts";

/** Sample data so the dashboard can be explored before any keys are connected. All names are made up. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const FIRST = ["James", "Maria", "Robert", "Linda", "Michael", "Patricia", "David", "Jennifer", "William", "Susan", "Carlos", "Karen", "Daniel", "Nancy", "Kevin", "Angela", "Brian", "Melissa", "Jason", "Rachel", "Tyler", "Heather", "Eric", "Diana"];
const LAST = ["Johnson", "Garcia", "Miller", "Davis", "Martinez", "Wilson", "Anderson", "Thomas", "Moore", "Jackson", "Lee", "Harris", "Clark", "Lewis", "Walker", "Hall", "Young", "King", "Wright", "Lopez", "Hill", "Scott", "Green", "Baker"];
const STREETS = ["Maple Ave", "Oak St", "Cedar Ln", "Pine Ridge Dr", "Willow Ct", "Elm St", "Lakeview Dr", "Sunset Blvd", "Hillcrest Rd", "Meadow Way", "Birch St", "Park Ave"];

const base = {
  active: true, ghl_token: null, notes: null, last_sync_error: null, incomplete_as: "review" as const,
  allowed_property_types: ["Single Family", "Townhouse"],
};

export function demoData(): { clients: Client[]; leads: Lead[] } {
  const now = Date.now();
  const clients: Client[] = [
    {
      ...base, id: "demo-summit", name: "Summit Roofing Co.", company_type: "roofing", ghl_location_id: "demo-loc-1",
      areas: [{ label: "Denver, CO", lat: 39.7392, lng: -104.9903, radius_miles: 30 }, { label: "Boulder, CO", lat: 40.015, lng: -105.2705, radius_miles: 15 }],
      target_zips: [], min_sqft: null, max_sqft: null, min_roof_sqft: 1600, max_roof_sqft: null, allowed_property_types: [],
      last_synced_at: new Date(now - 3 * 36e5).toISOString(), created_at: new Date(now - 90 * 864e5).toISOString(),
    },
    {
      ...base, id: "demo-coastal", name: "Coastal Home Remodeling", company_type: "home_improvement", ghl_location_id: "demo-loc-2",
      areas: [],
      target_zips: ["33602", "33606", "33609", "33611", "33629", "33618", "33647", "33626"],
      min_sqft: 1800, max_sqft: 6000, min_roof_sqft: null, max_roof_sqft: null,
      last_synced_at: new Date(now - 3 * 36e5).toISOString(), created_at: new Date(now - 60 * 864e5).toISOString(),
    },
    {
      ...base, id: "demo-prairie", name: "Prairie Roofing & Gutters", company_type: "roofing", ghl_location_id: "demo-loc-3",
      areas: [{ label: "Omaha, NE", lat: 41.2565, lng: -95.9345, radius_miles: 40 }],
      target_zips: [], min_sqft: null, max_sqft: null, min_roof_sqft: 1400, max_roof_sqft: null, allowed_property_types: [],
      last_synced_at: new Date(now - 3 * 36e5).toISOString(), created_at: new Date(now - 30 * 864e5).toISOString(),
    },
  ];

  const centers: Record<string, { lat: number; lng: number; city: string; state: string; zips: string[]; outZips: string[]; outCities: string[] }> = {
    "demo-summit": { lat: 39.7392, lng: -104.9903, city: "Denver", state: "CO", zips: ["80202", "80210", "80220", "80231"], outZips: ["80517", "80904"], outCities: ["Estes Park", "Colorado Springs"] },
    "demo-coastal": { lat: 27.9506, lng: -82.4572, city: "Tampa", state: "FL", zips: clients[1].target_zips, outZips: ["33801", "34601", "33870"], outCities: ["Lakeland", "Brooksville", "Sebring"] },
    "demo-prairie": { lat: 41.2565, lng: -95.9345, city: "Omaha", state: "NE", zips: ["68102", "68114", "68130", "68154"], outZips: ["68508", "68847"], outCities: ["Lincoln", "Kearney"] },
  };

  const leads: Lead[] = [];
  const counts: Record<string, number> = { "demo-summit": 34, "demo-coastal": 26, "demo-prairie": 19 };
  const r = rng(7);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];

  for (const c of clients) {
    const ctr = centers[c.id];
    for (let i = 0; i < counts[c.id]; i++) {
      const created = now - r() * 13 * 864e5;
      const out = r() < 0.18;
      const miles = out ? 45 + r() * 50 : r() * 26;
      const ang = r() * Math.PI * 2;
      const lat = ctr.lat + (miles / 69) * Math.sin(ang);
      const lng = ctr.lng + (miles / (69 * Math.cos((ctr.lat * Math.PI) / 180))) * Math.cos(ang);
      const roll = r();
      const status = roll < 0.06 ? "no_address" : roll < 0.11 ? "not_found" : "found";
      const typeRoll = r();
      const ptype = typeRoll < 0.72 ? "Single Family" : typeRoll < 0.82 ? "Townhouse" : typeRoll < 0.92 ? "Condo" : typeRoll < 0.97 ? "Manufactured" : "Apartment";
      const sqft = r() < 0.05 ? null : Math.round((800 + r() ** 1.4 * 3600) / 10) * 10;
      const oi = Math.floor(r() * ctr.outZips.length);
      const zip = out ? ctr.outZips[oi] : pick(ctr.zips);
      const first = pick(FIRST), last = pick(LAST);

      const responsive = r() < 0.58;
      const firstIn = responsive ? created + (5 + r() * 600) * 60000 : null;
      const clientResp = responsive && r() < 0.74;
      const firstResp = clientResp && firstIn ? firstIn + (2 + r() ** 2.5 * 1800) * 60000 : null;
      const booked = clientResp && r() < 0.52;

      const lead: Lead = {
        id: `${c.id}-${i}`, client_id: c.id, ghl_contact_id: `demo-${c.id}-${i}`,
        name: `${first} ${last}`, phone: `(555) ${String(200 + Math.floor(r() * 700))}-${String(1000 + Math.floor(r() * 8999))}`,
        email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
        address: status === "no_address" ? null : `${100 + Math.floor(r() * 9800)} ${pick(STREETS)}`,
        city: status === "no_address" ? null : out ? ctr.outCities[oi] : ctr.city, state: ctr.state, zip: status === "no_address" ? null : zip,
        source: pick(["Facebook Lead Form", "Facebook Lead Form", "Facebook Lead Form", "Website Form", "Google Ads"]),
        lead_created_at: new Date(created).toISOString(),
        property_status: status, formatted_address: null,
        lat: status === "no_address" ? null : lat, lng: status === "no_address" ? null : lng,
        ...(c.company_type === "roofing"
          ? {
              sqft: null, property_type: null, year_built: null, footprint_sqft: null,
              roof_sqft: status === "found" && sqft ? Math.round((sqft * (0.85 + r() * 0.7)) / 10) * 10 : null,
              roof_pitch: status === "found" ? 14 + Math.floor(r() * 26) : null,
              size_source: status === "found" ? "Google Solar" : null,
            }
          : {
              sqft: status === "found" ? sqft : null, property_type: status === "found" ? ptype : null,
              year_built: status === "found" ? 1950 + Math.floor(r() * 72) : null,
              roof_sqft: null, roof_pitch: null, footprint_sqft: null,
              size_source: status === "found" ? (r() < 0.7 ? "Redfin" : "Zillow") : null,
            }),
        distance_miles: null, nearest_area: null, in_area: null,
        responsive, first_inbound_at: firstIn ? new Date(firstIn).toISOString() : null,
        client_responded: clientResp, first_response_at: firstResp ? new Date(firstResp).toISOString() : null,
        booked, appointment_at: booked ? new Date(created + (1 + r() * 6) * 864e5).toISOString() : null,
        appointment_status: booked ? pick(["confirmed", "confirmed", "showed", "new"]) : null,
        engagement_checked_at: new Date(now - 3 * 36e5).toISOString(),
        grade: "review", reasons: [], override_grade: null, override_note: null,
        updated_at: new Date(now).toISOString(),
      };
      if (lead.address) lead.formatted_address = `${lead.address}, ${lead.city}, ${lead.state} ${lead.zip}`;
      const g = gradeLead(c, lead);
      Object.assign(lead, g);
      leads.push(lead);
    }
  }
  return { clients, leads };
}
