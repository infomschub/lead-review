export type Grade = "good" | "bad" | "review";

export const PROPERTY_TYPES = [
  "Single Family",
  "Townhouse",
  "Condo",
  "Multi-Family",
  "Manufactured",
  "Apartment",
  "Land",
] as const;

/** Everything the team sets up once per client. */
export interface Client {
  id: string;
  name: string;
  active: boolean;
  /** GHL sub-account (location) ID. */
  ghl_location_id: string;
  /** GHL Private Integration token for that sub-account. Never sent to the browser. */
  ghl_token: string | null;
  /** Service area: any of these ZIPs counts as in-area. */
  target_zips: string[];
  /** Service area: or within radius_miles of this point. */
  center_address: string | null;
  center_lat: number | null;
  center_lng: number | null;
  radius_miles: number | null;
  min_sqft: number | null;
  max_sqft: number | null;
  /** Empty = any property type allowed. */
  allowed_property_types: string[];
  notes: string | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
  created_at: string;
}

export type PropertyStatus = "pending" | "found" | "not_found" | "no_address" | "error";

export interface Lead {
  id: string;
  client_id: string;
  ghl_contact_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  source: string | null;
  lead_created_at: string;

  // Property lookup
  property_status: PropertyStatus;
  formatted_address: string | null;
  lat: number | null;
  lng: number | null;
  sqft: number | null;
  property_type: string | null;
  year_built: number | null;
  distance_miles: number | null;
  in_area: boolean | null;

  // Engagement (from GHL conversations + appointments)
  responsive: boolean;
  first_inbound_at: string | null;
  client_responded: boolean;
  first_response_at: string | null;
  booked: boolean;
  appointment_at: string | null;
  appointment_status: string | null;
  engagement_checked_at: string | null;

  // Result
  grade: Grade;
  reasons: string[];
  override_grade: Grade | null;
  override_note: string | null;
  updated_at: string;
}

export interface PropertyResult {
  status: PropertyStatus;
  formatted_address: string | null;
  lat: number | null;
  lng: number | null;
  zip: string | null;
  sqft: number | null;
  property_type: string | null;
  year_built: number | null;
}

export const finalGrade = (l: Pick<Lead, "grade" | "override_grade">): Grade =>
  l.override_grade ?? l.grade;
