"use client";
import { useTransition } from "react";
import { syncNow } from "@/app/actions";

export function SyncButton({ clientId, label = "Sync now" }: { clientId?: string; label?: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn-primary" disabled={pending} onClick={() => start(() => syncNow(clientId))}>
      <span className={pending ? "animate-spin" : ""}>↻</span>
      {pending ? "Syncing…" : label}
    </button>
  );
}
