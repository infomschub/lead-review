import Link from "next/link";
import { notFound } from "next/navigation";
import { store } from "@/lib/store";
import { ClientForm } from "@/components/ClientForm";
import { deleteClient } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function Settings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await store().getClient(id);
  if (!client) notFound();
  const { ghl_token, ...safe } = client;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/clients/${id}`} className="text-sm text-stone-500 hover:underline">← {client.name}</Link>
      <h1 className="text-2xl font-semibold">Targeting for {client.name}</h1>
      <ClientForm client={{ ...safe, hasToken: !!ghl_token }} />
      <form action={deleteClient} className="card flex flex-wrap items-center justify-between gap-3 border-red-200">
        <input type="hidden" name="id" value={id} />
        <p className="text-sm text-stone-600">Delete this client and all of its lead history. To stop syncing but keep the history, set Status to Paused or Lost instead.</p>
        <button className="btn border border-red-300 text-red-700 hover:bg-red-50">Delete client</button>
      </form>
    </div>
  );
}
