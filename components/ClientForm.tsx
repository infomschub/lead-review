"use client";

import { useActionState, useState, useTransition } from "react";
import { saveClient, testGhl } from "@/app/actions";
import { PROPERTY_TYPES, type Client, type CompanyType } from "@/lib/types";

let keySeq = 0;
const nextKey = () => ++keySeq;

export type SafeClient = Omit<Client, "ghl_token"> & { hasToken: boolean };

export function ClientForm({ client }: { client?: SafeClient }) {
  const [state, action, saving] = useActionState(saveClient, {});
  const [loc, setLoc] = useState(client?.ghl_location_id ?? "");
  const [token, setToken] = useState("");
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, startTest] = useTransition();
  const types = client?.allowed_property_types?.length ? client.allowed_property_types : ["Single Family", "Townhouse"];
  const [kind, setKind] = useState<CompanyType>(client?.company_type ?? "roofing");
  const [pins, setPins] = useState(() => {
    const saved = (client?.areas ?? []).map((a) => ({ key: nextKey(), label: a.label, radius: String(a.radius_miles) }));
    return saved.length ? saved : [{ key: nextKey(), label: "", radius: "" }];
  });
  const roof = kind !== "home_improvement";
  const home = kind !== "roofing";

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
          <div>
            <label className="label" htmlFor="status">Status</label>
            <select id="status" name="status" className="input" defaultValue={client?.status ?? "active"}>
              <option value="active">Active (leads checked every Monday)</option>
              <option value="paused">Paused (not synced, history kept)</option>
              <option value="lost">Lost (not synced, history kept)</option>
            </select>
          </div>
        </div>
        <fieldset>
          <legend className="label">Company type</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              ["roofing", "Roofing", "Judged on roof size, measured from Google satellite data."],
              ["home_improvement", "Home improvement", "Judged on home size and property type, scraped from Redfin and Zillow."],
              ["both", "Both", "Roof and home are both measured. Set limits for either or both."],
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
            Conversations, Conversation Messages, Calendars, Calendar Events and Opportunities, then paste the token here.
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
          <p className="hint">
            A lead is in the area if it&apos;s inside <strong>any</strong> pin&apos;s radius <strong>or</strong> its ZIP is listed.
            Add one pin per Facebook location. Leave pins and ZIPs empty to accept any location.
          </p>
        </div>
        <div className="space-y-2">
          <div className="hidden grid-cols-[1fr_8rem_2rem] gap-2 text-sm font-medium text-stone-700 sm:grid">
            <span>Pin: city, address, or coordinates</span>
            <span>Radius (miles)</span>
            <span />
          </div>
          {pins.map((p, k) => (
            <div key={p.key} className="grid grid-cols-[1fr_6rem_2rem] gap-2 sm:grid-cols-[1fr_8rem_2rem]">
              <input
                name="pin_label"
                aria-label={`Pin ${k + 1} location`}
                className="input"
                defaultValue={p.label}
                placeholder="Denver, CO  or  39.7392, -104.9903"
              />
              <input
                name="pin_radius"
                aria-label={`Pin ${k + 1} radius in miles`}
                inputMode="decimal"
                className="input"
                defaultValue={p.radius}
                placeholder="25"
              />
              <button
                type="button"
                className="rounded-lg text-stone-400 hover:bg-stone-100 hover:text-red-600"
                aria-label={`Remove pin ${k + 1}`}
                onClick={() => setPins((all) => all.filter((x) => x.key !== p.key))}
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="btn-ghost" onClick={() => setPins((all) => [...all, { key: nextKey(), label: "", radius: "" }])}>
            + Add pin
          </button>
          <p className="hint">
            For a dropped pin in Facebook, copy its coordinates (from Google Maps: right-click the spot → click the numbers) and paste them as{" "}
            <span className="font-mono">lat, lng</span>.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="zips">ZIP codes</label>
          <textarea id="zips" name="target_zips" rows={3} className="input font-mono" defaultValue={client?.target_zips.join(", ")} placeholder="33602, 33606, 33609" />
          <p className="hint">Paste from a spreadsheet. Commas, spaces or new lines all work.</p>
        </div>
      </section>

      <section className="card space-y-4" hidden={!roof}>
        <div>
          <h2 className="font-semibold">Roof size</h2>
          <p className="hint">Total roof surface area in sq ft (all roof sections, measured along the slope). Leave blank for no limit.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="rmin">Minimum roof sq ft</label>
            <input id="rmin" name="min_roof_sqft" inputMode="numeric" className="input" defaultValue={client?.min_roof_sqft ?? ""} placeholder="No minimum" />
          </div>
          <div>
            <label className="label" htmlFor="rmax">Maximum roof sq ft</label>
            <input id="rmax" name="max_roof_sqft" inputMode="numeric" className="input" defaultValue={client?.max_roof_sqft ?? ""} placeholder="No maximum" />
          </div>
        </div>
      </section>

      <section className="card space-y-4" hidden={!home}>
        <div>
          <h2 className="font-semibold">Home</h2>
          <p className="hint">
            Home size is the building <strong>footprint</strong> from Google satellite data: the ground area of one floor,
            including an attached garage. A 2-story home shows about half its living area, so set these limits as footprint
            (e.g. a 2,500 sq ft 2-story home ≈ 1,300–1,600 sq ft footprint). Once ScraperAPI is added, exact living area from
            Redfin/Zillow is used instead. Leave blank for no limit.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="min">Minimum home sq ft</label>
            <input id="min" name="min_sqft" inputMode="numeric" className="input" defaultValue={client?.min_sqft ?? ""} placeholder="No minimum" />
          </div>
          <div>
            <label className="label" htmlFor="max">Maximum home sq ft</label>
            <input id="max" name="max_sqft" inputMode="numeric" className="input" defaultValue={client?.max_sqft ?? ""} placeholder="No maximum" />
          </div>
        </div>
        <fieldset>
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
      </section>

      <section className="card space-y-4">
        <div>
          <label className="label" htmlFor="incomplete">Leads with a missing or incomplete address</label>
          <select id="incomplete" name="incomplete_as" className="input sm:w-80" defaultValue={client?.incomplete_as ?? "review"}>
            <option value="review">Needs review</option>
            <option value="bad">Bad</option>
          </select>
          <p className="hint">
            No street address, or Google can&apos;t find the exact house, so the roof/home can&apos;t be measured.
            They&apos;re still marked Bad if the city or ZIP is outside the service area.
          </p>
        </div>
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
