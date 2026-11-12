import { NextResponse } from "next/server";
import { syncAll } from "@/lib/sync";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Vercel Cron: Sundays 23:00 UTC = Mondays 7:00 AM Philippine time (see vercel.json). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, results: await syncAll() });
}
