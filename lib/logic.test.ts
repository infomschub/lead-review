import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeLead } from "./grade.ts";
import { deriveEngagement } from "./ghl.ts";
import { parseListing } from "./property.ts";
import type { Client } from "./types.ts";

const client: Client = {
  id: "c", name: "T", company_type: "home_improvement", active: true, ghl_location_id: "", ghl_token: null, target_zips: ["80202"],
  center_address: "Denver", center_lat: 39.7392, center_lng: -104.9903, radius_miles: 20,
  min_sqft: 1400, max_sqft: 5000, min_roof_sqft: null, max_roof_sqft: null, allowed_property_types: ["Single Family"], notes: null,
  last_synced_at: null, last_sync_error: null, created_at: "",
};
const home = { property_status: "found" as const, address: "1 Main", lat: 39.75, lng: -104.98, zip: "80203", sqft: 2200, roof_sqft: null, property_type: "Single Family" };

test("good home in radius", () => assert.equal(gradeLead(client, home).grade, "good"));
test("too small", () => assert.match(gradeLead(client, { ...home, sqft: 900 }).reasons[0], /too small/));
test("too large", () => assert.equal(gradeLead(client, { ...home, sqft: 9000 }).grade, "bad"));
test("condo rejected", () => assert.equal(gradeLead(client, { ...home, property_type: "Condo" }).grade, "bad"));
test("out of radius but listed zip is in", () =>
  assert.equal(gradeLead(client, { ...home, lat: 40.6, lng: -105.1, zip: "80202" }).grade, "good"));
test("out of radius and zip", () => assert.equal(gradeLead(client, { ...home, lat: 40.6, lng: -105.1 }).grade, "bad"));
test("no address -> review", () => assert.equal(gradeLead(client, { ...home, address: null, property_status: "no_address" }).grade, "review"));
test("not in records but in area -> review", () =>
  assert.equal(gradeLead(client, { ...home, property_status: "not_found", sqft: null, property_type: null }).grade, "review"));
test("not in records and out of area -> bad", () =>
  assert.equal(gradeLead(client, { ...home, property_status: "not_found", sqft: null, lat: 41, lng: -106 }).grade, "bad"));

const t = (m: number) => new Date(Date.UTC(2026, 0, 1, 12, m)).toISOString();
test("workflow texts alone don't count as client reply", () => {
  const e = deriveEngagement([
    { direction: "outbound", messageType: "TYPE_SMS", dateAdded: t(0), source: "workflow" },
    { direction: "inbound", messageType: "TYPE_SMS", dateAdded: t(5) },
    { direction: "outbound", messageType: "TYPE_SMS", dateAdded: t(6), source: "workflow" },
  ], []);
  assert.equal(e.responsive, true);
  assert.equal(e.client_responded, false);
});
test("human reply after lead reply counts", () => {
  const e = deriveEngagement([
    { direction: "inbound", messageType: "TYPE_SMS", dateAdded: t(5) },
    { direction: "outbound", messageType: "TYPE_SMS", dateAdded: t(20), source: "app", userId: "u1" },
  ], []);
  assert.equal(e.client_responded, true);
  assert.equal(e.first_response_at, t(20));
});
test("answered outbound call = responsive + client responded", () => {
  const e = deriveEngagement([
    { direction: "outbound", messageType: "TYPE_CALL", dateAdded: t(3), status: "completed", userId: "u1", meta: { call: { duration: 120, status: "completed" } } },
  ], []);
  assert.deepEqual([e.responsive, e.client_responded], [true, true]);
});
test("form activity is not a reply; cancelled appt not booked", () => {
  const e = deriveEngagement([{ direction: "inbound", messageType: "TYPE_ACTIVITY_CONTACT", dateAdded: t(0) }],
    [{ startTime: t(100), appointmentStatus: "cancelled" }]);
  assert.deepEqual([e.responsive, e.booked], [false, false]);
});

const roofer: Client = { ...client, company_type: "roofing", min_sqft: null, max_sqft: null, min_roof_sqft: 1500, allowed_property_types: [] };
test("roofing uses roof size, ignores property type", () => {
  assert.equal(gradeLead(roofer, { ...home, sqft: null, roof_sqft: 2400, property_type: null }).grade, "good");
  assert.match(gradeLead(roofer, { ...home, roof_sqft: 1100 }).reasons[0], /Roof too small/);
});
test("parse Zillow-style JSON", () => {
  const p = parseListing('..."homeType":"SINGLE_FAMILY","livingArea":2150,"yearBuilt":1987,...');
  assert.deepEqual(p, { sqft: 2150, property_type: "Single Family", year_built: 1987 });
});
test("parse Redfin-style HTML", () => {
  const p = parseListing('<span class="statsValue">1,840</span><span class="statsLabel">Sq Ft</span> <span>Property Type</span><span class="v">Townhouse</span> Built in 2004');
  assert.deepEqual(p, { sqft: 1840, property_type: "Townhouse", year_built: 2004 });
});

const both: Client = { ...client, company_type: "both", min_roof_sqft: 1500 };
test("both: checks roof and home limits", () => {
  assert.equal(gradeLead(both, { ...home, roof_sqft: 2400 }).grade, "good");
  assert.match(gradeLead(both, { ...home, roof_sqft: 900 }).reasons.join(), /Roof too small/);
  assert.match(gradeLead(both, { ...home, roof_sqft: 2400, sqft: 900 }).reasons.join(), /Home too small/);
  assert.equal(gradeLead(both, { ...home, roof_sqft: 2400, property_type: "Condo" }).grade, "bad");
});
test("both: missing roof with a roof limit -> review", () =>
  assert.match(gradeLead(both, { ...home, roof_sqft: null }).reasons.join(), /Roof size not found/));
test("appointments from location sweep count as booked", () => {
  const e = deriveEngagement([], [{ startTime: t(500), appointmentStatus: "confirmed" }, { startTime: t(100), appointmentStatus: "cancelled" }]);
  assert.deepEqual([e.booked, e.appointment_at], [true, t(500)]);
});
