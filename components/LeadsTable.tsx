"use client";

import { useMemo, useState, useTransition } from "react";
import { finalGrade, sizeLabel, type CompanyType, type Grade, type Lead } from "@/lib/types";
import { responseMinutes, fmtMinutes } from "@/lib/stats";
import { GradePill, GRADE_LABEL } from "./ui";
import { overrideLead } from "@/app/actions";

type Filter = "all" | Grade | "awaiting" | "booked" | "unresponsive";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "good", label: "Good" },
  { key: "bad", label: "Bad" },
  { key: "review", label: "Needs review" },
  { key: "awaiting", label: "Waiting on client" },
  { key: "unresponsive", label: "Unresponsive" },
  { key: "booked", label: "Booked" },
];

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

function matches(l: Lead, f: Filter) {
  if (f === "all") return true;
  if (f === "awaiting") return l.responsive && !l.client_responded;
  if (f === "booked") return l.booked;
  if (f === "unresponsive") return !l.responsive;
  return finalGrade(l) === f;
}

function Yes({ on, children }: { on: boolean; children?: React.ReactNode }) {
  return on ? (
    <span className="text-emerald-700">✓ {children}</span>
  ) : (
    <span className="text-stone-400">{children ?? "No"}</span>
  );
}

function csv(leads: Lead[]) {
  const head = ["Created", "Name", "Phone", "Email", "Address", "Home sq ft", "Property type", "Year built", "Roof sq ft", "Roof pitch (deg)", "Size source", "Distance (mi)", "In area", "Grade", "Reasons", "Team note", "Responsive", "Client replied", "Response time (min)", "Booked", "Appointment", "Source"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = leads.map((l) => [
    l.lead_created_at, l.name, l.phone, l.email, l.formatted_address ?? l.address, l.sqft, l.property_type, l.year_built,
    l.roof_sqft, l.roof_pitch, l.size_source, l.distance_miles, l.in_area == null ? "" : l.in_area ? "Yes" : "No", GRADE_LABEL[finalGrade(l)], l.reasons.join("; "),
    l.override_note, l.responsive ? "Yes" : "No", l.client_responded ? "Yes" : "No", responseMinutes(l), l.booked ? "Yes" : "No",
    l.appointment_at, l.source,
  ]);
  return [head, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

export function LeadsTable({
  leads, clientId, clientName, companyType,
}: { leads: Lead[]; clientId: string; clientName: string; companyType: CompanyType }) {
  const roofing = companyType === "roofing";
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return leads.filter(
      (l) =>
        matches(l, filter) &&
        (!needle || [l.name, l.phone, l.email, l.address, l.city, l.zip].some((v) => v?.toLowerCase().includes(needle))),
    );
  }, [leads, filter, q]);

  function download() {
    const blob = new Blob([csv(shown)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${clientName.replace(/\W+/g, "-")}-leads.csv`;
    a.click();
  }

  return (
    <div className="card p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 p-3">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => {
            const n = leads.filter((l) => matches(l, f.key)).length;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-3 py-1 text-sm ${filter === f.key ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"}`}
              >
                {f.label} <span className="opacity-60">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex w-full gap-2 sm:w-auto">
          <input className="input sm:w-56" placeholder="Search name, phone, address" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-ghost shrink-0" onClick={download}>Export CSV</button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-2.5">Lead</th>
              <th className="px-3 py-2.5">Address</th>
              <th className="px-3 py-2.5 text-right">{sizeLabel(companyType)}</th>
              <th className="px-3 py-2.5">Targeting</th>
              <th className="px-3 py-2.5">Responsive</th>
              <th className="px-3 py-2.5">Client replied</th>
              <th className="px-3 py-2.5">Booked</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {shown.map((l) => {
              const g = finalGrade(l);
              const mins = responseMinutes(l);
              return (
                <tr key={l.id} className="align-top hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <p className="font-medium">{l.name}</p>
                    <p className="text-xs text-stone-500">{fmtDate(l.lead_created_at)}{l.source ? ` · ${l.source}` : ""}</p>
                    {l.phone && <p className="text-xs text-stone-500">{l.phone}</p>}
                  </td>
                  <td className="max-w-[240px] px-3 py-3">
                    {l.address ? (
                      <a
                        className="hover:underline"
                        target="_blank"
                        rel="noreferrer"
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.formatted_address ?? [l.address, l.city, l.state, l.zip].join(" "))}`}
                      >
                        {l.formatted_address ?? [l.address, l.city, l.state, l.zip].filter(Boolean).join(", ")}
                      </a>
                    ) : (
                      <span className="text-stone-400">No address</span>
                    )}
                    {l.distance_miles != null && <p className="text-xs text-stone-500">{l.distance_miles} mi from center</p>}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {(() => {
                      const size = roofing ? l.roof_sqft : l.sqft;
                      const details = roofing
                        ? [l.roof_pitch != null && `${l.roof_pitch}° pitch`]
                        : [l.property_type, l.year_built && `built ${l.year_built}`];
                      return (
                        <>
                          {size != null ? <p className="font-medium tabular-nums">{size.toLocaleString()} sq ft</p> : <p className="text-stone-400">–</p>}
                          <p className="text-xs text-stone-500">{details.filter(Boolean).join(" · ")}</p>
                          {l.size_source && <p className="text-xs text-stone-400">via {l.size_source}</p>}
                        </>
                      );
                    })()}
                  </td>
                  <td className="max-w-[260px] px-3 py-3">
                    <GradePill grade={g} overridden={!!l.override_grade} />
                    <ul className="mt-1 space-y-0.5 text-xs text-stone-600">
                      {l.reasons.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                    {l.override_note && <p className="mt-1 text-xs italic text-stone-600">Note: {l.override_note}</p>}
                  </td>
                  <td className="px-3 py-3">
                    <Yes on={l.responsive}>{l.responsive ? "Yes" : "No reply"}</Yes>
                    {l.first_inbound_at && <p className="text-xs text-stone-500">{fmtDate(l.first_inbound_at)}</p>}
                  </td>
                  <td className="px-3 py-3">
                    {!l.responsive ? (
                      <span className="text-stone-400">–</span>
                    ) : l.client_responded ? (
                      <>
                        <Yes on>Yes</Yes>
                        <p className={`text-xs ${mins != null && mins > 60 ? "text-orange-600" : "text-stone-500"}`}>in {fmtMinutes(mins)}</p>
                      </>
                    ) : (
                      <span className="pill bg-orange-100 text-orange-800">Waiting</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {l.booked ? (
                      <>
                        <Yes on>Booked</Yes>
                        <p className="text-xs text-stone-500">{fmtDate(l.appointment_at)}{l.appointment_status ? ` · ${l.appointment_status}` : ""}</p>
                      </>
                    ) : (
                      <span className="text-stone-400">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-xs text-brand hover:underline" onClick={() => setEditing(editing === l.id ? null : l.id)}>
                      {editing === l.id ? "Close" : "Override"}
                    </button>
                    {editing === l.id && <OverrideBox lead={l} clientId={clientId} onDone={() => setEditing(null)} />}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-stone-500">No leads match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OverrideBox({ lead, clientId, onDone }: { lead: Lead; clientId: string; onDone: () => void }) {
  const [grade, setGrade] = useState<Grade | "">(lead.override_grade ?? "");
  const [note, setNote] = useState(lead.override_note ?? "");
  const [pending, start] = useTransition();
  return (
    <div className="mt-2 w-56 space-y-2 rounded-lg border border-stone-200 bg-white p-2 text-left shadow-lg">
      <select className="input" value={grade} onChange={(e) => setGrade(e.target.value as Grade | "")}>
        <option value="">Automatic ({GRADE_LABEL[lead.grade]})</option>
        <option value="good">Good</option>
        <option value="bad">Bad</option>
        <option value="review">Needs review</option>
      </select>
      <input className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button
        className="btn-primary w-full"
        disabled={pending}
        onClick={() => start(async () => { await overrideLead(lead.id, grade || null, note.trim() || null, clientId); onDone(); })}
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
