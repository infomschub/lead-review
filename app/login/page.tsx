import { login } from "../actions";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  return (
    <form action={login} className="card mx-auto mt-16 max-w-sm space-y-4">
      <h1 className="text-lg font-semibold">Team login</h1>
      <input type="hidden" name="next" value={sp.next ?? "/"} />
      <div>
        <label className="label" htmlFor="pw">Password</label>
        <input id="pw" name="password" type="password" className="input" autoFocus required />
      </div>
      {sp.error && <p className="text-sm text-red-600">Wrong password.</p>}
      <button className="btn-primary w-full">Log in</button>
    </form>
  );
}
