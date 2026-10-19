"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

type BusinessProfile = {
  businessName: string;
  address: string | null;
  logoUrl: string | null;
  currency: string;
  defaultTaxPercent: number;
  paymentInstructions: string | null;
};

type ProfileIssue = {
  path: string;
  message: string;
};

type ProfileErrorResponse = {
  error?: string;
  issues?: ProfileIssue[];
};

type FormValues = {
  businessName: string;
  address: string;
  logoUrl: string;
  currency: string;
  defaultTaxPercent: string;
  paymentInstructions: string;
};

const EMPTY_FORM: FormValues = {
  businessName: "",
  address: "",
  logoUrl: "",
  currency: "USD",
  defaultTaxPercent: "0",
  paymentInstructions: "",
};

const inputClassName =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-50 disabled:text-slate-500";

function toFormValues(profile: BusinessProfile | null): FormValues {
  if (!profile) {
    return EMPTY_FORM;
  }

  return {
    businessName: profile.businessName,
    address: profile.address ?? "",
    logoUrl: profile.logoUrl ?? "",
    currency: profile.currency,
    defaultTaxPercent: String(profile.defaultTaxPercent),
    paymentInstructions: profile.paymentInstructions ?? "",
  };
}

function errorMessages(data: unknown): string | null {
  const response = data as ProfileErrorResponse | null;
  const issues = response?.issues
    ?.map((issue) => issue.message)
    .filter(Boolean)
    .join(" ");

  return issues || response?.error || null;
}

export function BusinessProfileForm() {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [hasProfile, setHasProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadProfile = useCallback(
    () =>
      fetch("/api/business-profile", { cache: "no-store" })
        .then(async (response) => {
          if (response.status === 401) {
            router.replace("/login");
            router.refresh();
            return;
          }

          const data = (await response.json().catch(() => null)) as
            | BusinessProfile
            | ProfileErrorResponse
            | null;

          if (!response.ok) {
            setLoadError(
              errorMessages(data) ?? "Unable to load your business profile."
            );
            return;
          }

          const profile = data as BusinessProfile | null;
          setValues(toFormValues(profile));
          setHasProfile(profile !== null);
        })
        .catch(() => {
          setLoadError("Network error. Check your connection and try again.");
        })
        .finally(() => {
          setLoading(false);
        }),
    [router]
  );

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  function retryLoad() {
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setSuccess(null);
    void loadProfile();
  }

  function updateValue<Field extends keyof FormValues>(
    field: Field,
    value: FormValues[Field]
  ) {
    setSuccess(null);
    setSaveError(null);
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);
    setSuccess(null);

    const tax = Number(values.defaultTaxPercent);

    if (values.defaultTaxPercent.trim() === "" || !Number.isFinite(tax)) {
      setSaveError("Default tax must be a number between 0 and 100.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/business-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: values.businessName,
          address: values.address,
          logoUrl: values.logoUrl,
          currency: values.currency,
          defaultTaxPercent: tax,
          paymentInstructions: values.paymentInstructions,
        }),
      });

      if (response.status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }

      const data = (await response.json().catch(() => null)) as
        | BusinessProfile
        | ProfileErrorResponse
        | null;

      if (!response.ok) {
        setSaveError(
          errorMessages(data) ?? "Unable to save your business profile."
        );
        return;
      }

      setValues(toFormValues(data as BusinessProfile));
      setHasProfile(true);
      setSuccess("Business profile saved.");
    } catch {
      setSaveError("Network error. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="max-w-2xl">
        <h2 className="text-xl font-semibold text-slate-900">
          Business profile
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          These details become the seller information on the invoices you
          create.
        </p>
      </div>

      {loading ? (
        <p
          className="mt-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600"
          role="status"
        >
          Loading business profile...
        </p>
      ) : loadError ? (
        <div
          className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-4"
          role="alert"
        >
          <p className="break-words text-sm text-red-700">{loadError}</p>
          <button
            className="mt-3 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={retryLoad}
          >
            Try again
          </button>
        </div>
      ) : (
        <form className="mt-8" onSubmit={handleSubmit}>
          {!hasProfile ? (
            <p className="mb-6 break-words rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              No business profile yet. Fill in the fields below and save to
              create one.
            </p>
          ) : null}

          {saveError ? (
            <p
              className="mb-6 break-words rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              {saveError}
            </p>
          ) : null}

          {success ? (
            <p
              className="mb-6 break-words rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
              role="status"
            >
              {success}
            </p>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block min-w-0 sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Business name
              </span>
              <input
                className={inputClassName}
                type="text"
                name="businessName"
                autoComplete="organization"
                required
                maxLength={200}
                value={values.businessName}
                onChange={(event) =>
                  updateValue("businessName", event.target.value)
                }
                disabled={saving}
              />
            </label>

            <label className="block min-w-0 sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Logo URL
              </span>
              <input
                className={inputClassName}
                type="text"
                inputMode="url"
                name="logoUrl"
                autoComplete="url"
                maxLength={2048}
                placeholder="https://example.com/logo.png"
                value={values.logoUrl}
                onChange={(event) =>
                  updateValue("logoUrl", event.target.value)
                }
                disabled={saving}
              />
            </label>

            <label className="block min-w-0">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Currency
              </span>
              <input
                className={inputClassName}
                type="text"
                name="currency"
                required
                maxLength={3}
                pattern="[A-Z]{3}"
                autoCapitalize="characters"
                spellCheck={false}
                value={values.currency}
                onChange={(event) =>
                  updateValue("currency", event.target.value.toUpperCase())
                }
                disabled={saving}
              />
              <span className="mt-1.5 block text-xs text-slate-500">
                Three-letter code, e.g. USD.
              </span>
            </label>

            <label className="block min-w-0">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Default tax (%)
              </span>
              <input
                className={inputClassName}
                type="number"
                name="defaultTaxPercent"
                required
                min={0}
                max={100}
                step="0.01"
                value={values.defaultTaxPercent}
                onChange={(event) =>
                  updateValue("defaultTaxPercent", event.target.value)
                }
                disabled={saving}
              />
              <span className="mt-1.5 block text-xs text-slate-500">
                From 0 to 100, up to two decimal places.
              </span>
            </label>

            <label className="block min-w-0 sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Address
              </span>
              <textarea
                className={`${inputClassName} min-h-24 resize-y`}
                name="address"
                autoComplete="street-address"
                rows={3}
                maxLength={500}
                value={values.address}
                onChange={(event) =>
                  updateValue("address", event.target.value)
                }
                disabled={saving}
              />
            </label>

            <label className="block min-w-0 sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Payment instructions
              </span>
              <textarea
                className={`${inputClassName} min-h-28 resize-y`}
                name="paymentInstructions"
                rows={4}
                maxLength={2000}
                placeholder="Bank details, payment terms or other instructions."
                value={values.paymentInstructions}
                onChange={(event) =>
                  updateValue("paymentInstructions", event.target.value)
                }
                disabled={saving}
              />
            </label>
          </div>

          <div className="mt-8 flex justify-end border-t border-slate-200 pt-6">
            <button
              className="w-full rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              type="submit"
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : hasProfile
                  ? "Save changes"
                  : "Create business profile"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
