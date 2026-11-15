import { NextResponse } from "next/server";
import { store, isDemo } from "@/lib/store";
import { lookupConfigured, geocode, lastGeocodeError } from "@/lib/property";

export const dynamic = "force-dynamic";

/** Setup check: is the database reachable and are the keys set? Returns no lead data. */
export async function GET() {
  let database = "demo mode (Supabase keys not set)";
  if (!isDemo()) {
    try {
      const clients = await store().listClients();
      database = `connected (${clients.length} client${clients.length === 1 ? "" : "s"})`;
    } catch (e) {
      database = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  let google_geocoding = "not checked (no key)";
  if (lookupConfigured()) {
    const g = await geocode("Denver, CO");
    google_geocoding = g ? "working" : `error: ${lastGeocodeError}`;
  }
  return NextResponse.json({
    google_geocoding,
    database,
    google_key: lookupConfigured() ? "set" : "missing",
    scraper_key: process.env.SCRAPER_API_KEY ? "set" : "missing",
  });
}
