const statusStyles: Record<string, string> = {
  DRAFT: "border-slate-200 bg-slate-100 text-slate-700",
  SENT: "border-blue-200 bg-blue-50 text-blue-700",
  PAID: "border-emerald-200 bg-emerald-50 text-emerald-700",
  OVERDUE: "border-red-200 bg-red-50 text-red-700 font-bold",
};

type InvoiceStatusBadgeProps = {
  status: string;
};

// Shared by the invoice list and the invoice detail page so both show the
// same pill for the same status (DRAFT, SENT, PAID or the computed OVERDUE).
export function InvoiceStatusBadge({ status }: InvoiceStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide ${
        statusStyles[status] ?? statusStyles.DRAFT
      }`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current opacity-70" />
      {status}
    </span>
  );
}
