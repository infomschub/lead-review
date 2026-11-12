import { finalGrade, type Lead } from "./types.ts";

export interface Tally {
  total: number;
  good: number;
  bad: number;
  review: number;
  responsive: number;
  unresponsive: number;
  clientResponded: number;
  /** Lead replied, client hasn't replied back yet. The team's action list. */
  awaitingClient: number;
  booked: number;
  goodBooked: number;
  avgResponseMinutes: number | null;
}

export function responseMinutes(l: Lead): number | null {
  if (!l.first_inbound_at || !l.first_response_at) return null;
  return Math.max(0, Math.round((Date.parse(l.first_response_at) - Date.parse(l.first_inbound_at)) / 60000));
}

export function tally(leads: Lead[]): Tally {
  const t: Tally = {
    total: leads.length, good: 0, bad: 0, review: 0, responsive: 0, unresponsive: 0,
    clientResponded: 0, awaitingClient: 0, booked: 0, goodBooked: 0, avgResponseMinutes: null,
  };
  const mins: number[] = [];
  for (const l of leads) {
    const g = finalGrade(l);
    t[g]++;
    if (l.responsive) {
      t.responsive++;
      if (l.client_responded) t.clientResponded++;
      else t.awaitingClient++;
    } else t.unresponsive++;
    if (l.booked) {
      t.booked++;
      if (g === "good") t.goodBooked++;
    }
    const m = responseMinutes(l);
    if (m != null) mins.push(m);
  }
  if (mins.length) t.avgResponseMinutes = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length);
  return t;
}

export const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

export function fmtMinutes(m: number | null): string {
  if (m == null) return "–";
  if (m < 60) return `${m}m`;
  if (m < 60 * 24) return `${Math.round(m / 6) / 10}h`;
  return `${Math.round(m / 144) / 10}d`;
}
