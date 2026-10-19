"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Client = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type ClientErrorResponse = {
  error?: string;
};

const searchInputClassName =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10";

function SkeletonList() {
  return (
    <div className="mt-6 space-y-3" role="status" aria-live="polite">
      <span className="sr-only">Loading clients...</span>
      {[0, 1, 2].map((item) => (
        <div
          className="animate-pulse rounded-xl border border-slate-200 bg-slate-50 p-5"
          key={item}
        >
          <div className="h-4 w-1/3 rounded bg-slate-200" />
          <div className="mt-3 h-3 w-1/2 rounded bg-slate-200" />
          <div className="mt-2 h-3 w-2/5 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

export function ClientsManager() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    const id = ++requestId.current;
    const url = query
      ? `/api/clients?search=${encodeURIComponent(query)}`
      : "/api/clients";

    Promise.resolve()
      .then(() => {
        if (requestId.current === id) {
          setLoading(true);
        }

        return fetch(url, { cache: "no-store", signal: controller.signal });
      })
      .then(async (response) => {
        if (requestId.current !== id) {
          return;
        }

        if (response.status === 401) {
          router.replace("/login");
          router.refresh();
          return;
        }

        const data = (await response.json().catch(() => null)) as
          | Client[]
          | ClientErrorResponse
          | null;

        if (requestId.current !== id) {
          return;
        }

        if (!response.ok) {
          setClients([]);
          setError(
            (data as ClientErrorResponse | null)?.error ??
              "Unable to load clients."
          );
          return;
        }

        setClients(Array.isArray(data) ? data : []);
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
          setClients([]);
          setError("Network error. Check your connection and try again.");
        }
      })
      .finally(() => {
        if (requestId.current === id) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [query, reloadToken, router]);

  useEffect(() => {
    if (!deleteTarget) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !deleting) {
        setDeleteTarget(null);
        setDeleteError(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteTarget, deleting]);

  function retryLoad() {
    setError(null);
    setReloadToken((current) => current + 1);
  }

  function clearSearch() {
    setSearch("");
    setQuery("");
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) {
      return;
    }

    const target = deleteTarget;
    setDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/clients/${target.id}`, {
        method: "DELETE",
      });

      if (response.status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | ClientErrorResponse
          | null;
        setDeleteError(
          data?.error ??
            (response.status === 409
              ? "Client cannot be deleted while invoices exist."
              : "Unable to delete this client.")
        );
        return;
      }

      setClients((current) =>
        current.filter((client) => client.id !== target.id)
      );
      setDeleteTarget(null);
      setDeleteError(null);
    } catch {
      setDeleteError("Network error. Check your connection and try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="block w-full max-w-md">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Search clients
          </span>
          <input
            className={searchInputClassName}
            type="search"
            name="search"
            placeholder="Search by name or email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <Link
          className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 sm:mt-6"
          href="/clients/new"
        >
          New client
        </Link>
      </div>

      {loading ? (
        <SkeletonList />
      ) : error ? (
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
      ) : clients.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
          {query ? (
            <>
              <h2 className="text-lg font-semibold text-slate-900">
                No matching clients
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                No clients match &quot;{query}&quot;. Try a different name or
                email address.
              </p>
              <button
                className="mt-5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                type="button"
                onClick={clearSearch}
              >
                Clear search
              </button>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-slate-900">
                No clients yet
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                Add your first client to keep their billing details in one
                place.
              </p>
              <Link
                className="mt-5 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                href="/clients/new"
              >
                Add a client
              </Link>
            </>
          )}
        </div>
      ) : (
        <ul className="mt-6 space-y-3" aria-label="Clients">
          {clients.map((client) => (
            <li
              className="rounded-xl border border-slate-200 p-5 transition hover:border-slate-300"
              key={client.id}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="break-words text-base font-semibold text-slate-900">
                    {client.name}
                  </h2>
                  <dl className="mt-2 space-y-1 text-sm text-slate-600">
                    {client.email ? (
                      <div className="break-all">
                        <dt className="sr-only">Email</dt>
                        <dd>{client.email}</dd>
                      </div>
                    ) : null}
                    {client.phone ? (
                      <div className="break-words">
                        <dt className="sr-only">Phone</dt>
                        <dd>{client.phone}</dd>
                      </div>
                    ) : null}
                    {client.address ? (
                      <div className="whitespace-pre-line break-words">
                        <dt className="sr-only">Address</dt>
                        <dd>{client.address}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {client.notes ? (
                    <p className="mt-3 whitespace-pre-line break-words text-sm text-slate-500">
                      {client.notes}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Link
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
                    href={`/clients/${client.id}/edit`}
                  >
                    Edit
                  </Link>
                  <button
                    className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                    type="button"
                    aria-label={`Delete ${client.name}`}
                    onClick={() => {
                      setDeleteTarget(client);
                      setDeleteError(null);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            className="absolute inset-0 bg-slate-900/40"
            type="button"
            aria-label="Cancel deletion"
            onClick={() => {
              if (!deleting) {
                setDeleteTarget(null);
                setDeleteError(null);
              }
            }}
          />
          <div
            className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-client-title"
          >
            <h2
              className="text-lg font-semibold text-slate-900"
              id="delete-client-title"
            >
              Delete {deleteTarget.name}?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              This permanently removes the client and their contact details.
              Invoices that still reference this client will prevent deletion.
            </p>

            {deleteError ? (
              <p
                className="mt-4 break-words rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                role="alert"
              >
                {deleteError}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError(null);
                }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete client"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
