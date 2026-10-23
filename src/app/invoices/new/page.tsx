import Link from "next/link";
import { InvoiceForm } from "@/components/invoice-form";
import { AppShell } from "@/components/ui";
import { btnSecondary } from "@/components/ui-styles";
import { requirePageUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage() {
  const user = await requirePageUser();

  return (
    <AppShell
      userEmail={user.email}
      title="New invoice"
      actions={
        <Link className={btnSecondary} href="/invoices">
          Back to invoices
        </Link>
      }
    >
      <InvoiceForm mode="create" />
    </AppShell>
  );
}
