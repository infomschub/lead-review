import Link from "next/link";
import type { Grade } from "@/lib/types";
import type { Tally } from "@/lib/stats";
import { pct, fmtMinutes } from "@/lib/stats";

export const GRADE_STYLE: Record<Grade, string> = {
  good: "bg-emerald-100 text-emerald-800",
  bad: "bg-red-100 text-red-800",
  review: "bg-amber-100 text-amber-800",
};
export const GRADE_LABEL: Record<Grade, string> = { good: "Good", bad: "Bad", review: "Needs review" };

export function GradePill({ grade, overridden }: { grade: Grade; overridden?: boolean }) {
  return (
    <span className={`pill ${GRADE_STYLE[grade]}`} title={overridden ? "Set by the team" : undefined}>
      {GRADE_LABEL[grade]}
      {overridden && " ✎"}
    </span>
  );
}

export function RangeTabs({ days, base, extra }: { days: number; base: string; extra?: string }) {
  return (
    <div className="inline-flex rounded-lg border border-stone-300 bg-white p-0.5 text-sm">
      {[7, 14, 30].map((d) => (
        <Link
          key={d}
          href={`${base}?days=${d}${extra ? `&${extra}` : ""}`}
          className={`rounded-md px-3 py-1 ${d === days ? "bg-brand text-white" : "text-stone-600 hover:bg-stone-100"}`}
        >
          {d} days
        </Link>
      ))}
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <div className="card">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-stone-500">{sub}</p>}
    </div>
  );
}

export function TallyTiles({ t }: { t: Tally }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      <Tile label="Leads" value={t.total} />
      <Tile label="Good" value={t.good} sub={`${pct(t.good, t.total)}% of leads`} tone="text-emerald-700" />
      <Tile label="Bad" value={t.bad} sub={`${pct(t.bad, t.total)}% of leads`} tone="text-red-700" />
      <Tile label="Needs review" value={t.review} sub="missing data" tone="text-amber-700" />
      <Tile label="Responsive" value={t.responsive} sub={`${pct(t.responsive, t.total)}% replied or picked up`} />
      <Tile label="Client replied" value={t.clientResponded} sub={`${pct(t.clientResponded, t.responsive)}% of responsive · avg ${fmtMinutes(t.avgResponseMinutes)}`} />
      <Tile label="Waiting on client" value={t.awaitingClient} sub="lead replied, no answer yet" tone={t.awaitingClient ? "text-orange-600" : ""} />
      <Tile label="Booked" value={t.booked} sub={`${pct(t.booked, t.total)}% · ${t.goodBooked} good`} tone="text-brand" />
    </div>
  );
}

/** Stacked good / review / bad bar. */
export function QualityBar({ t }: { t: Tally }) {
  if (!t.total) return <div className="h-2 rounded-full bg-stone-100" />;
  return (
    <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${t.good} good, ${t.review} review, ${t.bad} bad`}>
      <div className="bg-emerald-500" style={{ width: `${(t.good / t.total) * 100}%` }} />
      <div className="bg-amber-400" style={{ width: `${(t.review / t.total) * 100}%` }} />
      <div className="bg-red-500" style={{ width: `${(t.bad / t.total) * 100}%` }} />
    </div>
  );
}

export function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}
