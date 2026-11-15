/**
 * GoHighLevel (LeadConnector) API v2.
 * One Private Integration token per client sub-account, with scopes:
 *   contacts.readonly, conversations.readonly, conversations/message.readonly, calendars.readonly, calendars/events.readonly,
 *   opportunities.readonly
 */
const BASE = "https://services.leadconnectorhq.com";

async function ghl<T>(token: string, path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: "2021-07-28",
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (res.status === 429 && attempt < 4) {
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    return ghl<T>(token, path, init, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL ${res.status} on ${path.split("?")[0]}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export interface GhlContact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  source: string | null;
  dateAdded: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapContact(c: any): GhlContact {
  const first = c.firstName ?? c.firstNameRaw ?? c.firstNameLowerCase ?? "";
  const last = c.lastName ?? c.lastNameRaw ?? c.lastNameLowerCase ?? "";
  const name = (c.contactName || `${first} ${last}`).trim() || c.email || c.phone || "Unnamed lead";
  return {
    id: c.id,
    name,
    phone: c.phone ?? null,
    email: c.email ?? null,
    address: (c.address1 ?? c.address ?? "").trim() || null,
    city: c.city ?? null,
    state: c.state ?? null,
    zip: c.postalCode ?? null,
    source: c.source ?? null,
    dateAdded: c.dateAdded,
  };
}

/** Contacts created in the window, newest first. */
export async function fetchRecentContacts(token: string, locationId: string, since: Date, until = new Date()) {
  const out: GhlContact[] = [];
  const pageLimit = 100;
  for (let page = 1; page <= 20; page++) {
    const data = await ghl<{ contacts: any[]; total?: number }>(token, "/contacts/search", {
      method: "POST",
      body: JSON.stringify({
        locationId,
        page,
        pageLimit,
        filters: [{ field: "dateAdded", operator: "range", value: { gte: since.toISOString(), lte: until.toISOString() } }],
        sort: [{ field: "dateAdded", direction: "desc" }],
      }),
    });
    out.push(...(data.contacts ?? []).map(mapContact));
    if ((data.contacts ?? []).length < pageLimit) break;
  }
  return out;
}

export interface Engagement {
  responsive: boolean;
  first_inbound_at: string | null;
  client_responded: boolean;
  first_response_at: string | null;
  booked: boolean;
  appointment_at: string | null;
  appointment_status: string | null;
}

const CONVERSATIONAL = new Set([
  "TYPE_SMS", "TYPE_EMAIL", "TYPE_CALL", "TYPE_FACEBOOK", "TYPE_INSTAGRAM",
  "TYPE_WHATSAPP", "TYPE_LIVE_CHAT", "TYPE_GMB", "TYPE_WEBCHAT",
]);
const AUTOMATED_SOURCES = new Set(["workflow", "bulk_actions", "campaign", "drip", "automation", "trigger"]);
const CANCELLED = new Set(["cancelled", "invalid"]);

interface Msg {
  direction?: string;
  messageType?: string;
  dateAdded: string;
  source?: string;
  userId?: string;
  status?: string;
  meta?: { call?: { duration?: number; status?: string } };
}

const isCall = (m: Msg) => m.messageType === "TYPE_CALL";
const callConnected = (m: Msg) =>
  isCall(m) && (m.meta?.call?.status === "completed" || m.status === "completed") && (m.meta?.call?.duration ?? 0) >= 30;

/**
 * Pure: work out engagement from a contact's messages and appointments.
 * - Responsive: the lead texted/emailed/messaged in, called in, or picked up a call of 30s+.
 * - Client responded: after the lead engaged, someone on the client's team (not a workflow)
 *   sent a message or had a connected call.
 * - Booked: any appointment that isn't cancelled.
 */
export function deriveEngagement(messages: Msg[], events: { startTime?: string; appointmentStatus?: string }[]): Engagement {
  const sorted = [...messages]
    .filter((m) => m.messageType && CONVERSATIONAL.has(m.messageType))
    .sort((a, b) => Date.parse(a.dateAdded) - Date.parse(b.dateAdded));

  const leadEngaged = (m: Msg) =>
    m.direction === "inbound" || (m.direction === "outbound" && callConnected(m));
  const firstIn = sorted.find(leadEngaged);

  let firstResp: Msg | undefined;
  if (firstIn) {
    const t0 = Date.parse(firstIn.dateAdded);
    firstResp = sorted.find((m) => {
      if (m.direction !== "outbound" || Date.parse(m.dateAdded) < t0) return false;
      if (isCall(m)) return callConnected(m) || !!m.userId;
      return !AUTOMATED_SOURCES.has((m.source ?? "").toLowerCase()) && (!!m.userId || m.source === "app");
    });
  }

  const live = events
    .filter((e) => !CANCELLED.has((e.appointmentStatus ?? "").toLowerCase()))
    .sort((a, b) => Date.parse(a.startTime ?? "") - Date.parse(b.startTime ?? ""));
  const appt = live[0];

  return {
    responsive: !!firstIn,
    first_inbound_at: firstIn?.dateAdded ?? null,
    client_responded: !!firstResp,
    first_response_at: firstResp?.dateAdded ?? null,
    booked: !!appt,
    appointment_at: appt?.startTime ?? null,
    appointment_status: appt?.appointmentStatus ?? null,
  };
}

export interface Appt {
  contactId?: string;
  startTime?: string;
  appointmentStatus?: string;
}

/**
 * Every appointment on every calendar in the sub-account between `since` and 120 days ahead,
 * grouped by contact. One sweep per sync instead of one call per lead, and it sees appointments
 * on all calendars (round-robin, team and personal).
 */
export async function fetchBookings(token: string, locationId: string, since: Date) {
  const byContact = new Map<string, Appt[]>();
  const cals = await ghl<{ calendars: { id: string }[] }>(token, `/calendars/?locationId=${encodeURIComponent(locationId)}`);
  const start = since.getTime() - 864e5;
  const end = Date.now() + 120 * 864e5;
  for (const cal of cals.calendars ?? []) {
    const data = await ghl<{ events: Appt[] }>(
      token,
      `/calendars/events?locationId=${encodeURIComponent(locationId)}&calendarId=${encodeURIComponent(cal.id)}&startTime=${start}&endTime=${end}`,
    );
    for (const e of data.events ?? []) {
      if (!e.contactId) continue;
      const list = byContact.get(e.contactId) ?? [];
      list.push(e);
      byContact.set(e.contactId, list);
    }
  }
  return byContact;
}

/**
 * Messages are read per contact. Appointments come from `bookings` (the location-wide sweep) when it worked,
 * otherwise from the contact's own appointments endpoint. Errors are thrown, never treated as "not booked".
 */
/**
 * Replies and bookings are read independently: if the token can't read conversations,
 * bookings still come through (and vice versa). Only the parts that worked are returned,
 * so a refused permission never overwrites good data with "no".
 */
export async function fetchEngagement(
  token: string,
  locationId: string,
  contactId: string,
  bookings: Map<string, Appt[]> | null,
  pipelines: Pipeline[] | null = null,
): Promise<{ fields: Partial<Engagement>; errors: string[] }> {
  const errors: string[] = [];
  const fail = (what: string) => (e: unknown) => {
    errors.push(`${what}: ${e instanceof Error ? e.message.slice(0, 160) : e}`);
    return null;
  };

  const readMessages = async () => {
    const convs = await ghl<{ conversations: { id: string }[] }>(
      token,
      `/conversations/search?locationId=${encodeURIComponent(locationId)}&contactId=${encodeURIComponent(contactId)}`,
    );
    const messages: Msg[] = [];
    for (const c of (convs.conversations ?? []).slice(0, 3)) {
      const data = await ghl<{ messages: { messages: Msg[] } }>(token, `/conversations/${c.id}/messages?limit=100`);
      messages.push(...(data.messages?.messages ?? []));
    }
    return messages;
  };

  const [messages, appts, opps] = await Promise.all([
    readMessages().catch(fail("Replies")),
    bookings
      ? Promise.resolve(bookings.get(contactId) ?? [])
      : ghl<{ events: Appt[] }>(token, `/contacts/${encodeURIComponent(contactId)}/appointments`)
          .then((d) => d.events ?? [])
          .catch(fail("Appointments")),
    pipelines?.length ? fetchOpportunities(token, locationId, contactId).catch(fail("Opportunities")) : Promise.resolve(null),
  ]);

  const e = deriveEngagement(messages ?? [], appts ?? []);
  const fields: Partial<Engagement> = {};
  if (messages) {
    Object.assign(fields, {
      responsive: e.responsive, first_inbound_at: e.first_inbound_at,
      client_responded: e.client_responded, first_response_at: e.first_response_at,
    });
  }
  // Calendar appointment first (it has the date); otherwise the opportunity stage.
  const opp = opps && pipelines?.length ? bookedFromOpportunities(opps, pipelines) : null;
  if (e.booked) {
    Object.assign(fields, { booked: true, appointment_at: e.appointment_at, appointment_status: e.appointment_status });
  } else if (opp) {
    Object.assign(fields, { booked: true, appointment_at: null, appointment_status: opp.stage });
  } else if (appts || opps) {
    Object.assign(fields, { booked: false, appointment_at: null, appointment_status: null });
  }
  return { fields, errors };
}

// ---------- Opportunities (pipeline stages) ----------

export interface Pipeline {
  id: string;
  name: string;
  stages: { id: string; name: string }[];
}
interface Opp {
  pipelineId?: string;
  pipelineStageId?: string;
  status?: string;
  updatedAt?: string;
  lastStageChangeAt?: string;
}

/** Stage names that mean "an appointment was booked", e.g. "Inspection Appointment Booked", "Consultation Booked". */
const BOOKED_STAGE = /\bbooked\b|\bappointment set\b|\bappt set\b|\bscheduled\b/i;
const NOT_BOOKED_STAGE = /\b(not|un|no)[\s-]?booked\b|\bnot scheduled\b|\bunscheduled\b/i;
export const isBookedStageName = (name: string) => BOOKED_STAGE.test(name) && !NOT_BOOKED_STAGE.test(name);

export async function fetchPipelines(token: string, locationId: string): Promise<Pipeline[]> {
  const data = await ghl<{ pipelines: Pipeline[] }>(token, `/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`);
  return data.pipelines ?? [];
}

/**
 * Pure: is any of the contact's opportunities in a "booked" stage, or past one in the same pipeline
 * (e.g. moved on to Proposal Sent or Won)? Returns the stage name it's in now.
 */
export function bookedFromOpportunities(opps: Opp[], pipelines: Pipeline[]): { stage: string; at: string | null } | null {
  for (const o of opps) {
    const p = pipelines.find((x) => x.id === o.pipelineId);
    if (!p) continue;
    const firstBooked = p.stages.findIndex((st) => isBookedStageName(st.name));
    if (firstBooked < 0) continue;
    const idx = p.stages.findIndex((st) => st.id === o.pipelineStageId);
    if (idx < 0) continue;
    const name = p.stages[idx].name;
    if (isBookedStageName(name) || (idx > firstBooked && !NOT_BOOKED_STAGE.test(name))) {
      return { stage: name, at: o.lastStageChangeAt ?? null };
    }
  }
  return null;
}

async function fetchOpportunities(token: string, locationId: string, contactId: string): Promise<Opp[]> {
  const data = await ghl<{ opportunities: Opp[] }>(
    token,
    `/opportunities/search?location_id=${encodeURIComponent(locationId)}&contact_id=${encodeURIComponent(contactId)}&limit=20`,
  );
  return data.opportunities ?? [];
}

/** Quick check used by the setup form's "Test connection" button. */
export async function testConnection(token: string, locationId: string) {
  const since = new Date(Date.now() - 7 * 864e5);
  const contacts = await fetchRecentContacts(token, locationId, since);
  return contacts.length;
}
