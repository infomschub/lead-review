import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeLead } from "./grade.ts";
import { deriveEngagement, bookedFromOpportunities, isBookedStageName } from "./ghl.ts";
import { parseListing } from "./property.ts";
import type { Client } from "./types.ts";

const client: Client = {
  id: "c", name: "T", company_type: "home_improvement", active: true, ghl_location_id: "", ghl_token: null, target_zips: ["80202"],
  areas: [{ label: "Denver", lat: 39.7392, lng: -104.9903, radius_miles: 20 }], incomplete_as: "review",
  min_sqft: 1400, max_sqft: 5000, min_roof_sqft: null, max_roof_sqft: null, allowed_property_types: ["Single Family"], notes: null,
  last_synced_at: null, last_sync_error: null, created_at: "",
};
const home = { property_status: "found" as const, address: "1 Main", city: "Denver", lat: 39.75, lng: -104.98, zip: "80203", sqft: 2200, roof_sqft: null, footprint_sqft: null, property_type: "Single Family" };

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

const multi: Client = {
  ...client, target_zips: [],
  areas: [
    { label: "Denver", lat: 39.7392, lng: -104.9903, radius_miles: 10 },
    { label: "Boulder", lat: 40.015, lng: -105.2705, radius_miles: 10 },
  ],
};
test("multiple pins: inside the second pin is in area, distance names nearest pin", () => {
  const r = gradeLead(multi, { ...home, lat: 40.02, lng: -105.25, zip: "80302" });
  assert.equal(r.grade, "good");
  assert.equal(r.nearest_area, "Boulder");
});
test("multiple pins: outside every pin is bad", () => {
  const r = gradeLead(multi, { ...home, lat: 40.6, lng: -105.1, zip: "80517" });
  assert.equal(r.grade, "bad");
  assert.match(r.reasons[0], /Outside service area .* from Boulder/);
});
test("incomplete address in area -> client setting", () => {
  const lead = { ...home, property_status: "incomplete" as const, sqft: null, roof_sqft: null };
  assert.equal(gradeLead(client, lead).grade, "review");
  assert.equal(gradeLead({ ...client, incomplete_as: "bad" }, lead).grade, "bad");
  assert.match(gradeLead(client, lead).reasons[0], /Incomplete address/);
});
test("city/ZIP only, outside area -> bad regardless of setting", () => {
  const lead = { ...home, address: null, property_status: "incomplete" as const, lat: 41, lng: -106, zip: "80517" };
  const r = gradeLead(client, lead);
  assert.equal(r.grade, "bad");
  assert.match(r.reasons.join(), /No street address/);
});
test("no address at all -> client setting", () => {
  const lead = { ...home, address: null, city: null, zip: null, lat: null, lng: null, property_status: "no_address" as const };
  assert.deepEqual(gradeLead(client, lead).reasons, ["No address on the lead"]);
  assert.equal(gradeLead({ ...client, incomplete_as: "bad" }, lead).grade, "bad");
});

const pipes = [{ id: "p1", name: "Sales", stages: [
  { id: "s1", name: "New Lead" }, { id: "s2", name: "Contacted" }, { id: "s3", name: "Inspection Appointment Booked" },
  { id: "s4", name: "Proposal Sent" }, { id: "s5", name: "Won" },
] }];
test("booked stage names", () => {
  for (const n of ["Inspection Appointment Booked", "Design Consultation booked", "Consultation Booked", "Appointment Set"]) assert.ok(isBookedStageName(n), n);
  for (const n of ["Not Booked", "New Lead", "Unbooked", "No-Booked"]) assert.ok(!isBookedStageName(n), n);
});
test("opportunity in or past booked stage = booked; before = not", () => {
  assert.equal(bookedFromOpportunities([{ pipelineId: "p1", pipelineStageId: "s3" }], pipes)?.stage, "Inspection Appointment Booked");
  assert.equal(bookedFromOpportunities([{ pipelineId: "p1", pipelineStageId: "s5" }], pipes)?.stage, "Won");
  assert.equal(bookedFromOpportunities([{ pipelineId: "p1", pipelineStageId: "s2" }], pipes), null);
  assert.equal(bookedFromOpportunities([{ pipelineId: "other", pipelineStageId: "s3" }], pipes), null);
});

test("home size falls back to footprint when living area is unknown", () => {
  const lead = { ...home, sqft: null, footprint_sqft: 1300, property_type: null };
  assert.match(gradeLead(client, lead).reasons[0], /Home footprint too small \(1,300/);
  assert.equal(gradeLead({ ...client, min_sqft: 1200 }, lead).grade, "good");
});
test("living area wins over footprint when both exist", () =>
  assert.equal(gradeLead(client, { ...home, sqft: 2200, footprint_sqft: 900 }).grade, "good"));
