import Link from "next/link";
import { ClientForm } from "@/components/ClientForm";

export default function NewClient() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/" className="text-sm text-stone-500 hover:underline">← All clients</Link>
      <h1 className="text-2xl font-semibold">Add client</h1>
      <p className="text-sm text-stone-500">Set this up once. Leads are pulled from GHL and checked against this targeting every Monday at 7:00 AM (PHT).</p>
      <ClientForm />
    </div>
  );
}
