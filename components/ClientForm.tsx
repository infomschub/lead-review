"use client";

import { useActionState, useState, useTransition } from "react";
import { saveClient, testGhl } from "@/app/actions";
import { PROPERTY_TYPES, type Client, type CompanyType } from "@/lib/types";

export type SafeClient = Omit<Client, "ghl_token"> & { hasToken: boolean };

export function ClientForm({ client }: { client?: SafeClient }) {
  const [state, action, saving] = useActionState(saveClient, {});
  const [loc, setLoc] = useState(client?.ghl_location_id ?? "");
  const [token, setToken] = useState("");
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, startTest] = useTransition();
  const types = client?.allowed_property_types?.length ? client.allowed_property_types : ["Single Family", "Townhouse"];
  const [kind, setKind] = useState<CompanyType>(client?.company_type ?? "roofing");
  const roofing = kind === "roofing";

  return (
    <form action={action} className="space-y-6">
      {client && <input type="hidden" name="id" value={client.id} />}

      <section className="card space-y-4">
        <h2 className="font-semibold">Client</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">Client name</label>
            <input id="name" name="name" className="input" defaultValue={client?.name} required />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={client?.active ?? true} className="h-4 w-4" />
            Active (checked every Monday and shown on the overview)
          </label>
        </div>
        <fieldset>
          <legend className="label">Company type</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ["roofing", "Roofing", "Judged on roof size, measured from Google satellite data."],
              ["home_improvement", "Home improvement", "Judged on home size and property type, scraped from Redfin and Zillow."],
            ] as const).map(([value, title, desc]) => (
              <label
                key={value}
                className={`cursor-pointer rounded-lg border p-3 ${kind === value ? "border-brand bg-brand-soft" : "border-stone-300 hover:bg-stone-50"}`}
              >
                <input type="radio" name="company_type" value={value} checked={kind === value} onChange={() => setKind(value)} className="sr-only" />
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block text-xs text-stone-600">{desc}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="font-semibold">GoHighLevel connection</h2>
          <p className="hint">
            In the client&apos;s sub-account: Settings → Private Integrations → Create. Give it read access to Contacts,
            Conversations, Conversation Messages and Calendar Events, then paste the token here.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="loc">Location ID</label>
            <input id="loc" name="ghl_location_id" className="input font-mono" value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="e.g. ve9EPM428h8vShlRW1KT" />
            <p className="hint">Settings → Business Profile, or in the sub-account URL.</p>
          </div>
          <div>
            <label className="label" htmlFor="tok">Private Integration token</label>
            <input id="tok" name="ghl_token" type="password" autoComplete="off" className="input font-mono" value={token} onChange={(e) => setToken(e.target.value)} placeholder={client?.hasToken ? "Saved. Leave blank to keep it." : "pit-…"} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-ghost" disabled={testing} onClick={() => startTest(async () => setTest(await testGhl(token, loc, client?.id)))}>
            {testing ? "Testing…" : "Test connection"}
          </button>
          {test && <p className={`text-sm ${test.ok ? "text-emerald-700" : "text-red-600"}`}>{test.message}</p>}
        </div>
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="font-semibold">Service area</h2>
          <p className="hint">A lead is in the area if its ZIP is listed <strong>or</strong> the home is inside the radius. Leave both empty to accept any location.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="center">Center address or city</label>
            <input id="center" name="center_address" className="input" defaultValue={client?.center_address ?? ""} placeholder="e.g. 123 Main St, Denver, CO" />
          </div>
          <div>
            <label className="label" htmlFor="radius">Radius (miles)</label>
            <input id="radius" name="radius_miles" inputMode="decimal" className="input" defaultValue={client?.radius_miles ?? ""} placeholder="30" />
          </div>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-stone-600">No Google Maps key? Enter the center&apos;s coordinates instead</summary>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <input name="center_lat" className="input" placeholder="Latitude, e.g. 39.7392" defaultValue={client?.center_lat ?? ""} />
            <input name="center_lng" className="input" placeholder="Longitude, e.g. -104.9903" defaultValue={client?.center_lng ?? ""} />
          </div>
        </details>
        <div>
          <label className="label" htmlFor="zips">ZIP codes</label>
          <textarea id="zips" name="target_zips" rows={3} className="input font-mono" defaultValue={client?.target_zips.join(", ")} placeholder="33602, 33606, 33609" />
          <p className="hint">Paste from a spreadsheet. Commas, spaces or new lines all work.</p>
        </div>
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="font-semibold">{roofing ? "Roof size" : "Home"}</h2>
          {roofing && <p className="hint">Total roof surface area in sq ft (all roof sections, measured along the slope).</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="min">Minimum {roofing ? "roof" : "home"} sq ft</label>
            <input id="min" name="min_sqft" inputMode="numeric" className="input" defaultValue={client?.min_sqft ?? ""} placeholder="No minimum" />
          </div>
          <div>
            <label className="label" htmlFor="max">Maximum {roofing ? "roof" : "home"} sq ft</label>
            <input id="max" name="max_sqft" inputMode="numeric" className="input" defaultValue={client?.max_sqft ?? ""} placeholder="No maximum" />
          </div>
        </div>
        <fieldset hidden={roofing}>
          <legend className="label">Accepted property types</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {PROPERTY_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="allowed_property_types" value={t} defaultChecked={types.includes(t)} className="h-4 w-4" />
                {t}
              </label>
            ))}
          </div>
          <p className="hint">Untick all to accept any type.</p>
        </fieldset>
        <div>
          <label className="label" htmlFor="notes">Notes for the team</label>
          <textarea id="notes" name="notes" rows={2} className="input" defaultValue={client?.notes ?? ""} />
        </div>
      </section>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={saving}>{saving ? "Saving…" : client ? "Save and re-grade leads" : "Create client"}</button>
      </div>
    </form>
  );
}
