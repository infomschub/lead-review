"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CLIENT_STATUSES, COMPANY_LABEL, type ClientStatus, type CompanyType } from "@/lib/types";

export interface SidebarClient {
  id: string;
  name: string;
  status: ClientStatus;
  company_type: CompanyType;
}

export function Sidebar({ clients }: { clients: SidebarClient[] }) {
  const pathname = usePathname();
  const currentId = pathname.match(/^\/clients\/([^/]+)/)?.[1];
  const current = clients.find((c) => c.id === currentId);
  const [tab, setTab] = useState<ClientStatus>(current?.status ?? "active");
  const shown = clients.filter((c) => c.status === tab);

  return (
    <nav aria-label="Clients" className="card p-2 lg:sticky lg:top-4">
      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-lg bg-stone-100 p-1 text-sm">
        {CLIENT_STATUSES.map((s) => {
          const n = clients.filter((c) => c.status === s.key).length;
          return (
            <button
              key={s.key}
              role="tab"
              aria-selected={tab === s.key}
              onClick={() => setTab(s.key)}
              className={`rounded-md px-2 py-1.5 font-medium ${tab === s.key ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900"}`}
            >
              {s.label}
              <span className="block text-xs font-normal text-stone-400">{n}</span>
            </button>
          );
        })}
      </div>
      <Link href={`/?status=${tab}`} className="mt-2 block rounded-md px-2 py-1.5 text-xs font-medium text-brand hover:bg-stone-50">
        Compare all {tab} clients →
      </Link>
      <ul className="max-h-[70vh] space-y-0.5 overflow-y-auto">
        {shown.map((c) => (
          <li key={c.id}>
            <Link
              href={`/clients/${c.id}`}
              aria-current={c.id === currentId ? "page" : undefined}
              className={`block rounded-md px-2 py-1.5 text-sm ${c.id === currentId ? "bg-brand-soft font-medium text-brand-dark" : "text-stone-700 hover:bg-stone-50"}`}
            >
              {c.name}
              <span className="block text-xs text-stone-400">{COMPANY_LABEL[c.company_type]}</span>
            </Link>
          </li>
        ))}
        {shown.length === 0 && <li className="px-2 py-3 text-sm text-stone-400">No {tab} clients.</li>}
      </ul>
    </nav>
  );
}
