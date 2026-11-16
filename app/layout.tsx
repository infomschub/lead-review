import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { isDemo, store } from "@/lib/store";
import { Sidebar, type SidebarClient } from "@/components/Sidebar";
import { lookupConfigured } from "@/lib/property";

export const metadata: Metadata = { title: "Lead Quality Review" };

/** Only logged-in viewers get the client list (the login page renders this layout too). */
async function sidebarClients(): Promise<SidebarClient[] | null> {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (pw && (await cookies()).get("lr_auth")?.value !== pw) return null;
  try {
    const clients = await store().listClients();
    return clients.map(({ id, name, status, company_type }) => ({ id, name, status: status ?? "active", company_type }));
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const demo = isDemo();
  const clients = await sidebarClients();
  return (
    <html lang="en">
      <body>
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-[96rem] items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-sm text-white">LQ</span>
              Lead Quality Review
            </Link>
            <Link href="/clients/new" className="btn-ghost">+ Add client</Link>
          </div>
        </header>
        {demo && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
            Demo mode: sample clients and leads. Connect Supabase, GHL and Google to go live.
          </div>
        )}
        {!demo && !lookupConfigured() && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
            GOOGLE_MAPS_API_KEY is not set, so roof sizes and service-area distances can&apos;t be checked.
          </div>
        )}
        {clients ? (
          <div className="mx-auto grid max-w-[96rem] gap-6 px-4 py-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
            <aside>
              <Sidebar clients={clients} />
            </aside>
            <main className="min-w-0">{children}</main>
          </div>
        ) : (
          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        )}
      </body>
    </html>
  );
}
