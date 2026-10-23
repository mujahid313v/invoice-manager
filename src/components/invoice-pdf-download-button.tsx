"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/components/spinner";
import { btnPrimary } from "@/components/ui-styles";

const ALLOWED_FILENAME = /^[A-Za-z0-9._-]+\.pdf$/;

type InvoicePdfDownloadButtonProps = {
  invoiceId: string;
  invoiceNumber: string;
};

// Status-independent: the owner can download the PDF of a Draft, Sent or
// Paid invoice.
export function InvoicePdfDownloadButton({
  invoiceId,
  invoiceNumber,
}: InvoicePdfDownloadButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function download() {
    if (pending) {
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/invoices/${invoiceId}/pdf`);

      if (response.status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;

        setError(data?.error ?? "Unable to generate the PDF. Try again.");
        return;
      }

      const disposition = response.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition)?.[1];
      const filename =
        match && ALLOWED_FILENAME.test(match) ? match : `${invoiceNumber}.pdf`;

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      setSuccess("PDF downloaded.");
      window.setTimeout(() => setSuccess(null), 4000);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setPending(false);
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

      <button
        className={btnPrimary}
        type="button"
        onClick={download}
        disabled={pending}
      >
        {pending ? (
          <>
            <Spinner className="size-4" />
            Generating...
          </>
        ) : (
          "Download PDF"
        )}
      </button>
    </div>
  );
}
