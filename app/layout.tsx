import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import { isDemo } from "@/lib/store";
import { propertyLookupConfigured } from "@/lib/property";

export const metadata: Metadata = { title: "Lead Quality Review" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const demo = isDemo();
  return (
    <html lang="en">
      <body>
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-sm text-white">LQ</span>
              Lead Quality Review
            </Link>
            <Link href="/clients/new" className="btn-ghost">+ Add client</Link>
          </div>
        </header>
        {demo && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
            Demo mode: sample clients and leads. Connect Supabase, GHL and RentCast to go live (see README).
          </div>
        )}
        {!demo && !propertyLookupConfigured() && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
            RENTCAST_API_KEY is not set, so home sizes can&apos;t be looked up.
          </div>
        )}
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
