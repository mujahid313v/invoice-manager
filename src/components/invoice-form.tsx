"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { computeInvoiceTotals, formatCentsInput, formatMoney, parseCentsInput } from "@/lib/money";
import { invoiceCreateSchema, invoiceUpdateSchema } from "@/lib/invoice-schema";

type ClientOption = {
  id: string;
  name: string;
};

type InvoiceIssue = {
  path: string;
  message: string;
};

type InvoiceErrorResponse = {
  error?: string;
  issues?: InvoiceIssue[];
};

type BusinessProfileData = {
  currency?: string;
  defaultTaxPercent?: number;
};

type ItemRow = {
  key: number;
  description: string;
  quantity: string;
  unitPrice: string;
};

export type InvoiceFormInitialValues = {
  clientId: string;
  issueDate: string;
  dueDate: string;
  taxPercent: string;
  discountCents: number;
  notes: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPriceCents: number;
  }>;
};

type InvoiceFormProps =
  | { mode: "create" }
  | { mode: "edit"; invoiceId: string; initialValues: InvoiceFormInitialValues };

const inputClassName =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-50 disabled:text-slate-500";

const errorInputClassName = "border-red-300 focus:border-red-500";

function toDateInputValue(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function newItemRow(key: number): ItemRow {
  return { key, description: "", quantity: "1", unitPrice: "" };
}

function toInitialItemRows(
  items: InvoiceFormInitialValues["items"]
): ItemRow[] {
  return items.map((item, index) => ({
    key: index,
    description: item.description,
    quantity: String(item.quantity),
    unitPrice: formatCentsInput(item.unitPriceCents),
  }));
}

function toFieldErrorMessage(
  issues: InvoiceIssue[] | undefined,
  match: (path: string) => boolean
): string | undefined {
  return issues?.find((issue) => match(issue.path))?.message;
}

export function InvoiceForm(props: InvoiceFormProps) {
  const router = useRouter();
  const isEdit = props.mode === "edit";
  const invoiceId = props.mode === "edit" ? props.invoiceId : null;
  const initialValues =
    props.mode === "edit" ? props.initialValues : undefined;
  const schema = isEdit ? invoiceUpdateSchema : invoiceCreateSchema;
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [profileTaxPercent, setProfileTaxPercent] = useState<number | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [clientId, setClientId] = useState(initialValues?.clientId ?? "");
  const [issueDate, setIssueDate] = useState(
    initialValues?.issueDate ?? toDateInputValue(new Date())
  );
  const [dueDate, setDueDate] = useState(() => {
    if (initialValues) {
      return initialValues.dueDate;
    }

    const due = new Date();
    due.setUTCDate(due.getUTCDate() + 14);
    return toDateInputValue(due);
  });
  const [taxPercentInput, setTaxPercentInput] = useState(
    initialValues?.taxPercent ?? ""
  );
  const [discountInput, setDiscountInput] = useState(
    initialValues ? formatCentsInput(initialValues.discountCents) : ""
  );
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [items, setItems] = useState<ItemRow[]>(() =>
    initialValues ? toInitialItemRows(initialValues.items) : [newItemRow(0)]
  );
  const nextRowKey = useRef(initialValues?.items.length ?? 1);

  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string | undefined>
  >({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      fetch("/api/clients", { cache: "no-store", signal: controller.signal }),
      fetch("/api/business-profile", {
        cache: "no-store",
        signal: controller.signal,
      }),
    ])
      .then(async ([clientsResponse, profileResponse]) => {
        if (clientsResponse.status === 401 || profileResponse.status === 401) {
          router.replace("/login");
          router.refresh();
          return;
        }

        const clientsData = (await clientsResponse.json().catch(() => null)) as
          | ClientOption[]
          | InvoiceErrorResponse
          | null;
        const profileData = (await profileResponse.json().catch(() => null)) as
          | BusinessProfileData
          | null;

        if (!clientsResponse.ok) {
          setLoadError(
            (clientsData as InvoiceErrorResponse | null)?.error ??
              "Unable to load clients."
          );
          return;
        }

        setClients(
          Array.isArray(clientsData)
            ? clientsData.map((client) => ({ id: client.id, name: client.name }))
            : []
        );

        if (profileResponse.ok && profileData) {
          if (typeof profileData.currency === "string") {
            setCurrency(profileData.currency);
          }
          if (typeof profileData.defaultTaxPercent === "number") {
            setProfileTaxPercent(profileData.defaultTaxPercent);
          }
        }

        setLoadError(null);
      })
      .catch((fetchError) => {
        if (
          fetchError instanceof DOMException &&
          fetchError.name === "AbortError"
        ) {
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
  }, [reloadToken, router]);

  const retryLoad = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setReloadToken((current) => current + 1);
  }, []);

  const draft = useMemo(() => {
    const parsedItems = items.map((item) => ({
      description: item.description,
      quantity: Number(item.quantity),
      unitPriceCents: parseCentsInput(item.unitPrice) ?? Number.NaN,
    }));

    const taxValue =
      taxPercentInput.trim() === ""
        ? profileTaxPercent ?? 0
        : Number(taxPercentInput);
    const discountValue =
      discountInput.trim() === "" ? 0 : parseCentsInput(discountInput) ?? 0;

    let totals:
      | { subtotalCents: number; taxCents: number; totalCents: number }
      | null = null;

    try {
      const computed = computeInvoiceTotals(parsedItems, taxValue, discountValue);

      if (
        Number.isSafeInteger(computed.subtotalCents) &&
        Number.isSafeInteger(computed.taxCents) &&
        Number.isSafeInteger(computed.totalCents)
      ) {
        totals = computed;
      }
    } catch {
      totals = null;
    }

    return { parsedItems, taxValue, discountValue, totals };
  }, [items, taxPercentInput, discountInput, profileTaxPercent]);

  function buildPayload() {
    return {
      clientId,
      issueDate,
      dueDate,
      notes,
      ...(taxPercentInput.trim() === ""
        ? {}
        : { taxPercent: Number(taxPercentInput) }),
      ...(discountInput.trim() === ""
        ? {}
        : { discountCents: parseCentsInput(discountInput) ?? Number.NaN }),
      items: draft.parsedItems,
    };
  }

  function updateItem(key: number, patch: Partial<Omit<ItemRow, "key">>) {
    setServerError(null);
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  }

  function addItem() {
    setItems((current) =>
      current.length >= 100
        ? current
        : [...current, newItemRow(nextRowKey.current++)]
    );
  }

  function removeItem(key: number) {
    setItems((current) =>
      current.length > 1 ? current.filter((item) => item.key !== key) : current
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError(null);

    const parsed = schema.safeParse(buildPayload());

    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      }));
      const nextErrors: Record<string, string | undefined> = {
        clientId: toFieldErrorMessage(issues, (path) => path === "clientId"),
        issueDate: toFieldErrorMessage(issues, (path) => path === "issueDate"),
        dueDate: toFieldErrorMessage(issues, (path) => path === "dueDate"),
        taxPercent: toFieldErrorMessage(issues, (path) =>
          path.startsWith("taxPercent")
        ),
        discountCents: toFieldErrorMessage(issues, (path) =>
          path.startsWith("discountCents")
        ),
        notes: toFieldErrorMessage(issues, (path) => path.startsWith("notes")),
        itemsRoot: toFieldErrorMessage(issues, (path) => path === "items"),
      };

      for (const issue of issues) {
        const match = /^items\.(\d+)\.(.+)$/.exec(issue.path);

        if (match) {
          const key = items[Number(match[1])]?.key;

          if (key !== undefined && !nextErrors[`item.${key}.${match[2]}`]) {
            nextErrors[`item.${key}.${match[2]}`] = issue.message;
          }
        }
      }

      setFieldErrors(nextErrors);
      return;
    }

    if (
      draft.totals &&
      draft.discountValue > 0 &&
      draft.discountValue > draft.totals.subtotalCents
    ) {
      setFieldErrors((current) => ({
        ...current,
        discountCents: "Discount cannot exceed the subtotal.",
      }));
      return;
    }

    setFieldErrors({});
    setSaving(true);

    try {
      const response = await fetch(
        isEdit && invoiceId ? `/api/invoices/${invoiceId}` : "/api/invoices",
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
        | InvoiceErrorResponse
        | null;

      if (!response.ok) {
        setServerError(
          data?.issues
            ?.map((issue) => issue.message)
            .filter(Boolean)
            .join(" ") ||
            data?.error ||
            (isEdit
              ? "Unable to save the invoice."
              : "Unable to create invoice.")
        );
        return;
      }

      router.push(
        isEdit && invoiceId
          ? `/invoices/${invoiceId}?saved=edit`
          : "/invoices"
      );
      router.refresh();
    } catch {
      setServerError("Network error. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const estimateTaxPercent = Number.isFinite(draft.taxValue)
    ? draft.taxValue
    : null;

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="animate-pulse space-y-4" role="status" aria-live="polite">
          <span className="sr-only">Loading invoice form...</span>
          <div className="h-4 w-1/3 rounded bg-slate-200" />
          <div className="h-10 w-2/3 rounded bg-slate-200" />
          <div className="h-10 w-1/2 rounded bg-slate-200" />
          <div className="h-24 w-full rounded bg-slate-200" />
        </div>
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
              href="/invoices"
            >
              Back to invoices
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (clients.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
          <h2 className="text-lg font-semibold text-slate-900">
            No clients yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            Invoices are billed to a client. Add your first client to get
            started.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              href="/clients/new"
            >
              Add a client
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
              href="/invoices"
            >
              Back to invoices
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
          ? "Update the invoice details. Only draft invoices can be edited."
          : "Pick a client, add line items and we'll calculate the totals when the invoice is saved."}
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
              Client
            </span>
            <select
              className={`${inputClassName} ${
                fieldErrors.clientId ? errorInputClassName : ""
              }`}
              name="clientId"
              value={clientId}
              onChange={(event) => {
                setClientId(event.target.value);
                setServerError(null);
              }}
              aria-invalid={fieldErrors.clientId ? true : undefined}
              disabled={saving}
            >
              <option value="">Select a client...</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            {fieldErrors.clientId ? (
              <span className="mt-1.5 block text-xs text-red-600">
                {fieldErrors.clientId}
              </span>
            ) : null}
          </label>

          <label className="block min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Issue date
            </span>
            <input
              className={`${inputClassName} ${
                fieldErrors.issueDate ? errorInputClassName : ""
              }`}
              type="date"
              name="issueDate"
              value={issueDate}
              onChange={(event) => setIssueDate(event.target.value)}
              aria-invalid={fieldErrors.issueDate ? true : undefined}
              disabled={saving}
            />
            {fieldErrors.issueDate ? (
              <span className="mt-1.5 block text-xs text-red-600">
                {fieldErrors.issueDate}
              </span>
            ) : null}
          </label>

          <label className="block min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Due date
            </span>
            <input
              className={`${inputClassName} ${
                fieldErrors.dueDate ? errorInputClassName : ""
              }`}
              type="date"
              name="dueDate"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              aria-invalid={fieldErrors.dueDate ? true : undefined}
              disabled={saving}
            />
            {fieldErrors.dueDate ? (
              <span className="mt-1.5 block text-xs text-red-600">
                {fieldErrors.dueDate}
              </span>
            ) : null}
          </label>
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
              Line items
            </h2>
            <button
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={addItem}
              disabled={saving || items.length >= 100}
            >
              Add item
            </button>
          </div>

          {fieldErrors.itemsRoot ? (
            <p className="mt-2 text-xs text-red-600" role="alert">
              {fieldErrors.itemsRoot}
            </p>
          ) : null}

          <div className="mt-4 space-y-3">
            {items.map((item, index) => (
              <div
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                key={item.key}
              >
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_5.5rem_8.5rem_2.5rem] sm:items-start">
                  <label className="block min-w-0 sm:col-span-3">
                    <span className="mb-1.5 block text-xs font-medium text-slate-600">
                      Description {index + 1}
                    </span>
                    <input
                      className={`${inputClassName} ${
                        fieldErrors[`item.${item.key}.description`]
                          ? errorInputClassName
                          : ""
                      }`}
                      type="text"
                      maxLength={500}
                      placeholder="e.g. Website design"
                      value={item.description}
                      onChange={(event) =>
                        updateItem(item.key, { description: event.target.value })
                      }
                      disabled={saving}
                    />
                    {fieldErrors[`item.${item.key}.description`] ? (
                      <span className="mt-1.5 block text-xs text-red-600">
                        {
                          fieldErrors[`item.${item.key}.description`]
                        }
                      </span>
                    ) : null}
                  </label>

                  <label className="block min-w-0">
                    <span className="mb-1.5 block text-xs font-medium text-slate-600">
                      Qty
                    </span>
                    <input
                      className={`${inputClassName} ${
                        fieldErrors[`item.${item.key}.quantity`]
                          ? errorInputClassName
                          : ""
                      }`}
                      type="number"
                      min={1}
                      max={1_000_000}
                      step={1}
                      inputMode="numeric"
                      value={item.quantity}
                      onChange={(event) =>
                        updateItem(item.key, { quantity: event.target.value })
                      }
                      disabled={saving}
                    />
                  </label>

                  <label className="block min-w-0">
                    <span className="mb-1.5 block text-xs font-medium text-slate-600">
                      Unit price ({currency})
                    </span>
                    <input
                      className={`${inputClassName} ${
                        fieldErrors[`item.${item.key}.unitPriceCents`]
                          ? errorInputClassName
                          : ""
                      }`}
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={item.unitPrice}
                      onChange={(event) =>
                        updateItem(item.key, { unitPrice: event.target.value })
                      }
                      disabled={saving}
                    />
                  </label>

                  <div className="flex items-end sm:justify-end">
                    <button
                      className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-semibold text-slate-500 transition hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                      type="button"
                      onClick={() => removeItem(item.key)}
                      disabled={saving || items.length <= 1}
                      aria-label={`Remove line item ${index + 1}`}
                      title={
                        items.length <= 1
                          ? "An invoice needs at least one line item"
                          : "Remove this line item"
                      }
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {(fieldErrors[`item.${item.key}.quantity`] ||
                  fieldErrors[`item.${item.key}.unitPriceCents`]) && (
                  <p className="mt-2 text-xs text-red-600" role="alert">
                    {fieldErrors[`item.${item.key}.quantity`] ??
                      fieldErrors[`item.${item.key}.unitPriceCents`]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Tax %{" "}
              <span className="font-normal text-slate-500">(optional)</span>
            </span>
            <input
              className={`${inputClassName} ${
                fieldErrors.taxPercent ? errorInputClassName : ""
              }`}
              type="number"
              min={0}
              max={100}
              step="0.01"
              inputMode="decimal"
              placeholder={
                profileTaxPercent === null
                  ? "e.g. 10"
                  : `Default: ${profileTaxPercent}`
              }
              value={taxPercentInput}
              onChange={(event) => setTaxPercentInput(event.target.value)}
              aria-invalid={fieldErrors.taxPercent ? true : undefined}
              disabled={saving}
            />
            {fieldErrors.taxPercent ? (
              <span className="mt-1.5 block text-xs text-red-600">
                {fieldErrors.taxPercent}
              </span>
            ) : null}
          </label>

          <label className="block min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Discount ({currency}){" "}
              <span className="font-normal text-slate-500">(optional)</span>
            </span>
            <input
              className={`${inputClassName} ${
                fieldErrors.discountCents ? errorInputClassName : ""
              }`}
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={discountInput}
              onChange={(event) => setDiscountInput(event.target.value)}
              aria-invalid={fieldErrors.discountCents ? true : undefined}
              disabled={saving}
            />
            {fieldErrors.discountCents ? (
              <span className="mt-1.5 block text-xs text-red-600">
                {fieldErrors.discountCents}
              </span>
            ) : null}
          </label>
        </div>

        <div className="mt-8">
          <label className="block min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Notes{" "}
              <span className="font-normal text-slate-500">
                (optional, shown on the invoice)
              </span>
            </span>
            <textarea
              className={`${inputClassName} min-h-24 resize-y ${
                fieldErrors.notes ? errorInputClassName : ""
              }`}
              name="notes"
              maxLength={2000}
              placeholder="e.g. Thank you for your business!"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              aria-invalid={fieldErrors.notes ? true : undefined}
              disabled={saving}
            />
            {fieldErrors.notes ? (
              <span className="mt-1.5 block text-xs text-red-600">
                {fieldErrors.notes}
              </span>
            ) : null}
          </label>
        </div>

        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Totals preview (estimate)
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Subtotal, tax and total are calculated on the server when the
            invoice is saved.
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-600">Subtotal</dt>
              <dd className="font-medium text-slate-900">
                {draft.totals
                  ? formatMoney(draft.totals.subtotalCents, currency)
                  : "—"}
              </dd>
            </div>
            {draft.discountValue > 0 ? (
              <div className="flex items-center justify-between">
                <dt className="text-slate-600">Discount</dt>
                <dd className="font-medium text-slate-900">
                  −{formatMoney(draft.discountValue, currency)}
                </dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <dt className="text-slate-600">
                Tax{estimateTaxPercent === null ? "" : ` (${estimateTaxPercent}%)`}
              </dt>
              <dd className="font-medium text-slate-900">
                {draft.totals
                  ? formatMoney(draft.totals.taxCents, currency)
                  : "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-2">
              <dt className="font-semibold text-slate-900">Total</dt>
              <dd className="text-base font-semibold text-slate-900">
                {draft.totals
                  ? formatMoney(draft.totals.totalCents, currency)
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:justify-end">
          <Link
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
            href={isEdit && invoiceId ? `/invoices/${invoiceId}` : "/invoices"}
          >
            Cancel
          </Link>
          <button
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            {saving
              ? isEdit
                ? "Saving..."
                : "Creating..."
              : isEdit
                ? "Save changes"
                : "Create invoice"}
          </button>
        </div>
      </form>
    </section>
  );
}
