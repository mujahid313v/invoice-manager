"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { formatMoney } from "@/lib/money";

type InvoiceListItem = {
  id: string;
  number: string;
  status: string;
  issueDate: string;
  dueDate: string;
  taxPercent: number;
  discountCents: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  clientId: string;
  clientName: string;
  createdAt: string;
  updatedAt: string;
};

type InvoiceListResponse = {
  invoices: InvoiceListItem[];
  total: number;
  page: number;
  pageSize: number;
};

type InvoiceErrorResponse = {
  error?: string;
};

type StatusFilter = "" | "DRAFT" | "SENT" | "PAID" | "OVERDUE";
type SortKey = "date" | "amount";
type SortOrder = "asc" | "desc";

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

function SkeletonRows() {
  return (
    <div className="mt-6 space-y-3" role="status" aria-live="polite">
      <span className="sr-only">Loading invoices...</span>
      {[0, 1, 2].map((item) => (
        <div
          className="animate-pulse rounded-xl border border-slate-200 bg-slate-50 p-5"
          key={item}
        >
          <div className="h-4 w-1/4 rounded bg-slate-200" />
          <div className="mt-3 h-3 w-1/2 rounded bg-slate-200" />
          <div className="mt-2 h-3 w-2/5 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

function buildPageList(
  totalPages: number,
  current: number
): (number | "gap")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages]);

  for (
    let page = Math.max(2, current - 1);
    page <= Math.min(totalPages - 1, current + 1);
    page += 1
  ) {
    pages.add(page);
  }

  const sorted = [...pages].sort((left, right) => left - right);
  const result: (number | "gap")[] = [];
  let previous = 0;

  for (const page of sorted) {
    if (previous !== 0 && page - previous > 1) {
      result.push("gap");
    }
    result.push(page);
    previous = page;
  }

  return result;
}

function ariaSort(
  column: SortKey,
  activeSort: SortKey,
  order: SortOrder
): "ascending" | "descending" | "none" {
  return column === activeSort ? (order === "asc" ? "ascending" : "descending") : "none";
}

export function InvoicesManager() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [sort, setSort] = useState<SortKey>("date");
  const [order, setOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);

  const [response, setResponse] = useState<InvoiceListResponse | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    const id = ++requestId.current;

    const query = new URLSearchParams({
      sort,
      order,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });

    if (search) {
      query.set("search", search);
    }

    if (statusFilter) {
      query.set("status", statusFilter);
    }

    Promise.all([
      fetch(`/api/invoices?${query.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      }),
      fetch("/api/business-profile", {
        cache: "no-store",
        signal: controller.signal,
      }),
    ])
      .then(async ([invoicesResponse, profileResponse]) => {
        if (requestId.current !== id) {
          return;
        }

        if (
          invoicesResponse.status === 401 ||
          profileResponse.status === 401
        ) {
          router.replace("/login");
          router.refresh();
          return;
        }

        const invoiceData = (await invoicesResponse.json().catch(() => null)) as
          | InvoiceListResponse
          | InvoiceErrorResponse
          | null;
        const profileData = (await profileResponse.json().catch(() => null)) as
          | { currency?: string }
          | null;

        if (requestId.current !== id) {
          return;
        }

        if (!invoicesResponse.ok) {
          setResponse(null);
          setError(
            (invoiceData as InvoiceErrorResponse | null)?.error ??
              "Unable to load invoices."
          );
          return;
        }

        if (
          profileResponse.ok &&
          profileData &&
          typeof profileData.currency === "string"
        ) {
          setCurrency(profileData.currency);
        }

        setResponse(invoiceData as InvoiceListResponse);
        setError(null);
      })
      .catch((fetchError) => {
        if (
          fetchError instanceof DOMException &&
          fetchError.name === "AbortError"
        ) {
          return;
        }

        if (requestId.current === id) {
          setResponse(null);
          setError("Network error. Check your connection and try again.");
        }
      })
      .finally(() => {
        if (requestId.current === id) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [order, page, reloadToken, router, search, sort, statusFilter]);

  const retryLoad = useCallback(() => {
    setError(null);
    setReloadToken((current) => current + 1);
  }, []);

  function changeStatusFilter(value: StatusFilter) {
    setStatusFilter(value);
    setPage(1);
  }

  function changeOrder(nextOrder: SortOrder) {
    setOrder(nextOrder);
    setPage(1);
  }

  function clickSortHeader(column: SortKey) {
    if (column === sort) {
      changeOrder(order === "asc" ? "desc" : "asc");
    } else {
      setSort(column);
      changeOrder("desc");
    }
  }

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setStatusFilter("");
    setPage(1);
  }

  function goToPage(nextPage: number) {
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const invoices = response?.invoices ?? [];
  const total = response?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasActiveFilters = Boolean(search) || Boolean(statusFilter);
  const pageList = useMemo(
    () => buildPageList(totalPages, page),
    [totalPages, page]
  );

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  function renderSection(body: ReactNode) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Invoices</h2>
            <p className="mt-1 text-sm text-slate-600">
              Sending, paying and PDF exports come in later phases.
            </p>
          </div>
          <Link
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
            href="/invoices/new"
          >
            New invoice
          </Link>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_10rem]">
          <label className="block min-w-0">
            <span className="sr-only">Search invoices</span>
            <input
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              type="search"
              placeholder="Search by number or client name..."
              aria-label="Search invoices by number or client name"
              maxLength={200}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>

          <label className="block min-w-0">
            <span className="mb-1.5 block text-xs font-medium text-slate-600 sm:mb-0 sm:mt-2.5">
              Status
            </span>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(event) =>
                changeStatusFilter(event.target.value as StatusFilter)
              }
            >
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SENT">Sent</option>
              <option value="PAID">Paid</option>
              <option value="OVERDUE">Overdue</option>
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1.5 block text-xs font-medium text-slate-600 sm:mb-0 sm:mt-2.5">
              Sort order
            </span>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              aria-label="Sort direction"
              value={order}
              onChange={(event) => changeOrder(event.target.value as SortOrder)}
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </label>
        </div>

        {body}
      </section>
    );
  }

  if (loading) {
    return renderSection(<SkeletonRows />);
  }

  if (error) {
    return renderSection(
      <div
        className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-4"
        role="alert"
      >
        <p className="break-words text-sm text-red-700">{error}</p>
        <button
          className="mt-3 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          onClick={retryLoad}
        >
          Try again
        </button>
      </div>
    );
  }

  if (invoices.length === 0) {
    return renderSection(
      <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
        <h3 className="text-lg font-semibold text-slate-900">
          {hasActiveFilters ? "No invoices match your filters" : "No invoices yet"}
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          {hasActiveFilters
            ? "Try a different search term or status, or clear the filters to see everything."
            : "Create your first draft invoice for one of your clients."}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {hasActiveFilters ? (
            <button
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
              type="button"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          ) : (
            <Link
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              href="/invoices/new"
            >
              Create an invoice
            </Link>
          )}
        </div>
      </div>
    );
  }

  return renderSection(
    <>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="py-3 pr-4 font-semibold">Number</th>
              <th className="py-3 pr-4 font-semibold">Client</th>
              <th
                className="py-3 pr-4 font-semibold"
                aria-sort={ariaSort("amount", sort, order)}
              >
                <button
                  className="inline-flex items-center gap-1 rounded text-xs font-semibold uppercase tracking-wide text-slate-500 transition hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/30"
                  type="button"
                  onClick={() => clickSortHeader("amount")}
                >
                  Total{sort === "amount" ? (order === "asc" ? " ↑" : " ↓") : ""}
                </button>
              </th>
              <th className="py-3 pr-4 font-semibold">Status</th>
              <th
                className="py-3 pr-4 font-semibold"
                aria-sort={ariaSort("date", sort, order)}
              >
                <button
                  className="inline-flex items-center gap-1 rounded text-xs font-semibold uppercase tracking-wide text-slate-500 transition hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/30"
                  type="button"
                  onClick={() => clickSortHeader("date")}
                >
                  Issue date
                  {sort === "date" ? (order === "asc" ? " ↑" : " ↓") : ""}
                </button>
              </th>
              <th className="py-3 font-semibold">Due date</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr
                className="border-b border-slate-100 last:border-0"
                key={invoice.id}
              >
                <td className="py-3.5 pr-4 font-semibold text-slate-900">
                  <Link
                    className="rounded transition hover:text-slate-600 hover:underline"
                    href={`/invoices/${invoice.id}`}
                  >
                    {invoice.number}
                  </Link>
                </td>
                <td className="py-3.5 pr-4 text-slate-700">
                  {invoice.clientName}
                </td>
                <td className="py-3.5 pr-4 text-slate-700">
                  {formatMoney(invoice.totalCents, currency)}
                </td>
                <td className="py-3.5 pr-4">
                  <InvoiceStatusBadge status={invoice.status} />
                </td>
                <td className="py-3.5 pr-4 text-slate-700">{invoice.issueDate}</td>
                <td className="py-3.5 text-slate-700">{invoice.dueDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav
        className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between"
        aria-label="Invoice pages"
      >
        <p className="text-sm text-slate-600">
          Showing {rangeStart}–{rangeEnd} of {total} invoices
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
            type="button"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
          >
            Previous
          </button>
          {pageList.map((entry, index) =>
            entry === "gap" ? (
              <span
                className="px-1 text-sm text-slate-400"
                key={`gap-${index}`}
                aria-hidden="true"
              >
                …
              </span>
            ) : (
              <button
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-slate-900/30 ${
                  entry === page
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900"
                }`}
                type="button"
                key={entry}
                onClick={() => goToPage(entry)}
                aria-current={entry === page ? "page" : undefined}
                aria-label={`Go to page ${entry}`}
              >
                {entry}
              </button>
            )
          )}
          <button
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
            type="button"
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      </nav>
    </>
  );
}
