import Link from "next/link";
import { btnPrimary, btnSecondary } from "@/components/ui-styles";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-100 via-slate-100 to-slate-200 px-4 py-12">
      <div className="anim-rise w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/70">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          404
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Page not found
        </h1>
        <p className="mx-auto mt-2 max-w-prose text-sm leading-6 text-slate-600">
          The page you are looking for does not exist. Head back to your
          dashboard or invoice list.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link className={btnPrimary} href="/dashboard">
            Dashboard
          </Link>
          <Link className={btnSecondary} href="/invoices">
            Invoices
          </Link>
        </div>
      </div>
    </main>
  );
}
