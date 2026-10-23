"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/spinner";
import {
  btnDanger,
  btnDangerOutline,
  btnPrimary,
  btnSecondary,
} from "@/components/ui-styles";

type InvoiceActionsProps = {
  invoiceId: string;
  status: "DRAFT" | "SENT" | "PAID";
};

type InvoiceErrorResponse = {
  error?: string;
};

export function InvoiceActions({ invoiceId, status }: InvoiceActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!confirmingDelete) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && pending === null) {
        setConfirmingDelete(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmingDelete, pending]);

  // Move focus into the dialog while it is open and return it to the
  // trigger when it closes.
  useEffect(() => {
    if (!confirmingDelete) {
      return;
    }

    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    return () => previous?.focus();
  }, [confirmingDelete]);

  async function changeStatus(next: "SENT" | "PAID") {
    if (pending) {
      return;
    }

    setPending(next);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/invoices/${invoiceId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });

      if (response.status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | InvoiceErrorResponse
          | null;

        setError(
          data?.error ??
            (response.status === 409
              ? "That change is not allowed for this invoice."
              : "Unable to update the invoice.")
        );
        return;
      }

      setSuccess(
        next === "SENT"
          ? "Invoice marked as sent."
          : "Invoice marked as paid."
      );
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setPending(null);
    }
  }

  async function deleteInvoice() {
    if (pending) {
      return;
    }

    setPending("DELETE");
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/invoices/${invoiceId}`, {
        method: "DELETE",
      });

      if (response.status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | InvoiceErrorResponse
          | null;

        setError(
          data?.error ??
            (response.status === 409
              ? "Only draft invoices can be deleted."
              : "Unable to delete the invoice.")
        );
        setConfirmingDelete(false);
        return;
      }

      router.push("/invoices");
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
      setConfirmingDelete(false);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mt-8 border-t border-slate-200 pt-6">
      {error ? (
        <p
          className="anim-fade mb-4 break-words rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {success ? (
        <p
          className="anim-fade mb-4 break-words rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          role="status"
        >
          {success}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {status === "DRAFT" ? (
          <Link className={btnPrimary} href={`/invoices/${invoiceId}/edit`}>
            Edit
          </Link>
        ) : null}

        {status === "DRAFT" ? (
          <button
            className={btnSecondary}
            type="button"
            onClick={() => changeStatus("SENT")}
            disabled={pending !== null}
          >
            {pending === "SENT" ? (
              <>
                <Spinner className="size-4" />
                Marking as sent...
              </>
            ) : (
              "Mark as sent"
            )}
          </button>
        ) : null}

        {status === "SENT" ? (
          <button
            className={btnSecondary}
            type="button"
            onClick={() => changeStatus("PAID")}
            disabled={pending !== null}
          >
            {pending === "PAID" ? (
              <>
                <Spinner className="size-4" />
                Marking as paid...
              </>
            ) : (
              "Mark as paid"
            )}
          </button>
        ) : null}

        {status === "DRAFT" ? (
          <button
            className={btnDangerOutline}
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={pending !== null}
          >
            Delete
          </button>
        ) : null}
      </div>

      {confirmingDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            className="anim-fade absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
            type="button"
            aria-label="Cancel deletion"
            onClick={() => {
              if (!pending) {
                setConfirmingDelete(false);
              }
            }}
          />
          <div
            className="anim-pop relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl outline-none"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-invoice-title"
            tabIndex={-1}
            ref={dialogRef}
          >
            <h2
              className="text-lg font-semibold text-slate-900"
              id="delete-invoice-title"
            >
              Delete this invoice?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              This permanently removes the invoice and its line items. Only
              draft invoices can be deleted.
            </p>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className={btnSecondary}
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={pending !== null}
              >
                Cancel
              </button>
              <button
                className={btnDanger}
                type="button"
                onClick={deleteInvoice}
                disabled={pending !== null}
              >
                {pending === "DELETE" ? (
                  <>
                    <Spinner className="size-4" />
                    Deleting...
                  </>
                ) : (
                  "Delete invoice"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
