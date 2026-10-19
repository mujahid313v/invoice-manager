"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { clientSchema } from "@/lib/validation";

type ClientRecord = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
};

type ClientIssue = {
  path: string;
  message: string;
};

type ClientErrorResponse = {
  error?: string;
  issues?: ClientIssue[];
};

type FormValues = {
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
};

type FieldErrors = Partial<Record<keyof FormValues, string>>;

const EMPTY_FORM: FormValues = {
  name: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
};

const inputClassName =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-50 disabled:text-slate-500";

const errorInputClassName = "border-red-300 focus:border-red-500";

function toFormValues(client: ClientRecord): FormValues {
  return {
    name: client.name,
    email: client.email ?? "",
    phone: client.phone ?? "",
    address: client.address ?? "",
    notes: client.notes ?? "",
  };
}

function errorMessages(data: unknown): string | null {
  const response = data as ClientErrorResponse | null;
  const issues = response?.issues
    ?.map((issue) => issue.message)
    .filter(Boolean)
    .join(" ");

  return issues || response?.error || null;
}

function toFieldErrors(issues: ClientIssue[] | undefined): FieldErrors {
  const errors: FieldErrors = {};

  for (const issue of issues ?? []) {
    const field = issue.path.split(".")[0] as keyof FormValues;

    if (
      Object.prototype.hasOwnProperty.call(EMPTY_FORM, field) &&
      !errors[field]
    ) {
      errors[field] = issue.message;
    }
  }

  return errors;
}

type ClientFormProps =
  | { mode: "create" }
  | { mode: "edit"; clientId: string };

export function ClientForm(props: ClientFormProps) {
  const router = useRouter();
  const isEdit = props.mode === "edit";
  const clientId = props.mode === "edit" ? props.clientId : null;
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!isEdit || !clientId) {
      return;
    }

    const controller = new AbortController();

    fetch(`/api/clients/${clientId}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace("/login");
          router.refresh();
          return;
        }

        const data = (await response.json().catch(() => null)) as
          | ClientRecord
          | ClientErrorResponse
          | null;

        if (!response.ok) {
          setLoadError(
            response.status === 404
              ? "Client not found."
              : errorMessages(data) ?? "Unable to load this client."
          );
          return;
        }

        setValues(toFormValues(data as ClientRecord));
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setLoadError("Network error. Check your connection and try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [clientId, isEdit, reloadToken, router]);

  const retryLoad = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setServerError(null);
    setReloadToken((current) => current + 1);
  }, []);

  function updateValue<Field extends keyof FormValues>(
    field: Field,
    value: FormValues[Field]
  ) {
    setServerError(null);
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError(null);

    const parsed = clientSchema.safeParse(values);

    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      }));
      setFieldErrors(toFieldErrors(issues));
      return;
    }

    setFieldErrors({});
    setSaving(true);

    try {
      const response = await fetch(
        isEdit && clientId ? `/api/clients/${clientId}` : "/api/clients",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        }
      );

      if (response.status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }

      const data = (await response.json().catch(() => null)) as
        | ClientRecord
        | ClientErrorResponse
        | null;

      if (!response.ok) {
        const issueData = data as ClientErrorResponse | null;
        setFieldErrors(toFieldErrors(issueData?.issues));
        setServerError(
          errorMessages(data) ?? "Unable to save this client."
        );
        return;
      }

      router.push("/clients");
      router.refresh();
    } catch {
      setServerError("Network error. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600"
          role="status"
        >
          Loading client...
        </p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-4"
          role="alert"
        >
          <p className="break-words text-sm text-red-700">{loadError}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={retryLoad}
            >
              Try again
            </button>
            <Link
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
              href="/clients"
            >
              Back to clients
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-sm text-slate-600">
        {isEdit
          ? "Update the contact details for this client."
          : "Add a client so you can bill them later."}
      </p>

      <form className="mt-6" onSubmit={handleSubmit} noValidate>
        {serverError ? (
          <p
            className="mb-6 break-words rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            {serverError}
          </p>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block min-w-0 sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Name
            </span>
            <input
              className={`${inputClassName} ${
                fieldErrors.name ? errorInputClassName : ""
              }`}
              type="text"
              name="name"
              autoComplete="name"
              maxLength={200}
              value={values.name}
              onChange={(event) => updateValue("name", event.target.value)}
              aria-invalid={fieldErrors.name ? true : undefined}
              aria-describedby={fieldErrors.name ? "name-error" : undefined}
              disabled={saving}
            />
            {fieldErrors.name ? (
              <span
                className="mt-1.5 block text-xs text-red-600"
                id="name-error"
              >
                {fieldErrors.name}
              </span>
            ) : null}
          </label>

          <label className="block min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Email
            </span>
            <input
              className={`${inputClassName} ${
                fieldErrors.email ? errorInputClassName : ""
              }`}
              type="email"
              name="email"
              autoComplete="email"
              maxLength={254}
              value={values.email}
              onChange={(event) => updateValue("email", event.target.value)}
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
              disabled={saving}
            />
            {fieldErrors.email ? (
              <span
                className="mt-1.5 block text-xs text-red-600"
                id="email-error"
              >
                {fieldErrors.email}
              </span>
            ) : null}
          </label>

          <label className="block min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Phone
            </span>
            <input
              className={`${inputClassName} ${
                fieldErrors.phone ? errorInputClassName : ""
              }`}
              type="tel"
              name="phone"
              autoComplete="tel"
              maxLength={50}
              value={values.phone}
              onChange={(event) => updateValue("phone", event.target.value)}
              aria-invalid={fieldErrors.phone ? true : undefined}
              aria-describedby={fieldErrors.phone ? "phone-error" : undefined}
              disabled={saving}
            />
            {fieldErrors.phone ? (
              <span
                className="mt-1.5 block text-xs text-red-600"
                id="phone-error"
              >
                {fieldErrors.phone}
              </span>
            ) : null}
          </label>

          <label className="block min-w-0 sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Address
            </span>
            <textarea
              className={`${inputClassName} min-h-24 resize-y ${
                fieldErrors.address ? errorInputClassName : ""
              }`}
              name="address"
              autoComplete="street-address"
              rows={3}
              maxLength={500}
              value={values.address}
              onChange={(event) => updateValue("address", event.target.value)}
              aria-invalid={fieldErrors.address ? true : undefined}
              aria-describedby={
                fieldErrors.address ? "address-error" : undefined
              }
              disabled={saving}
            />
            {fieldErrors.address ? (
              <span
                className="mt-1.5 block text-xs text-red-600"
                id="address-error"
              >
                {fieldErrors.address}
              </span>
            ) : null}
          </label>

          <label className="block min-w-0 sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Notes
            </span>
            <textarea
              className={`${inputClassName} min-h-28 resize-y ${
                fieldErrors.notes ? errorInputClassName : ""
              }`}
              name="notes"
              rows={4}
              maxLength={2000}
              placeholder="Billing preferences, contact hours or other details."
              value={values.notes}
              onChange={(event) => updateValue("notes", event.target.value)}
              aria-invalid={fieldErrors.notes ? true : undefined}
              aria-describedby={fieldErrors.notes ? "notes-error" : undefined}
              disabled={saving}
            />
            {fieldErrors.notes ? (
              <span
                className="mt-1.5 block text-xs text-red-600"
                id="notes-error"
              >
                {fieldErrors.notes}
              </span>
            ) : null}
          </label>
        </div>

        <div className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:justify-end">
          <Link
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
            href="/clients"
          >
            Cancel
          </Link>
          <button
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            {saving
              ? "Saving..."
              : isEdit
                ? "Save changes"
                : "Create client"}
          </button>
        </div>
      </form>
    </section>
  );
}
