import Link from "next/link";
import { headers } from "next/headers";
import { DashboardContent } from "@/components/dashboard-content";
import { LogoutButton } from "@/components/logout-button";
import { requirePageUser } from "@/lib/auth";
import { getDashboardForUser } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requirePageUser();
  // The page loads the aggregates directly through the same function the
  // API route uses: no self-fetch, and the numbers cannot diverge.
  const dashboard = await getDashboardForUser(user.id);
  const acceptLanguage = (await headers()).get("accept-language");

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Invoice Manager
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Dashboard
          </h1>
          <p className="mt-2 break-words text-sm text-slate-600">
            Signed in as{" "}
            <span className="break-all font-medium text-slate-900">
              {user.email}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3 sm:justify-end">
          <Link
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
            href="/invoices/new"
          >
            New invoice
          </Link>
          <Link
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
            href="/invoices"
          >
            Invoices
          </Link>
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

      <DashboardContent data={dashboard} acceptLanguage={acceptLanguage} />
    </main>
  );
}
