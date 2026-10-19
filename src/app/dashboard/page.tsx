import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { requirePageUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requirePageUser();

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Invoice Manager
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Dashboard
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Signed in as{" "}
            <span className="font-medium text-slate-900">{user.email}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3 sm:justify-end">
          <Link
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
            href="/clients"
          >
            Clients
          </Link>
          <Link
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
            href="/settings"
          >
            Settings
          </Link>
          <LogoutButton />
        </div>
      </header>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex size-12 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
          OK
        </div>
        <h2 className="mt-5 text-xl font-semibold text-slate-900">
          You are signed in
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          This dashboard is a placeholder for the next phases. Business
          profiles, clients, invoices and PDFs are not part of Phase 1.
        </p>
      </section>
    </main>
  );
}
