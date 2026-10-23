"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Spinner } from "@/components/spinner";
import { btnPrimary, inputClass } from "@/components/ui-styles";

const inputClassName = inputClass;

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        setError(data?.error ?? "Unable to create your account.");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-100 via-slate-100 to-slate-200 px-4 py-12">
      <section className="anim-rise w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-sm font-bold tracking-tight text-white shadow-sm">
            IM
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Invoice Manager
            </p>
            <p className="text-xs text-slate-500">
              Simple billing for small teams
            </p>
          </div>
        </div>

        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-slate-900">
          Create your account
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Start managing clients and invoices in one place.
        </p>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          {error ? (
            <p
              className="anim-fade rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Email
            </span>
            <input
              className={inputClassName}
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Password
            </span>
            <input
              className={inputClassName}
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={72}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
            />
            <span className="mt-1.5 block text-xs text-slate-500">
              Use at least 8 characters.
            </span>
          </label>

          <button
            className={`${btnPrimary} w-full`}
            type="submit"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Spinner className="size-4" />
                Creating account...
              </>
            ) : (
              "Create account"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link
            className="font-semibold text-slate-900 underline-offset-4 hover:underline"
            href="/login"
          >
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
