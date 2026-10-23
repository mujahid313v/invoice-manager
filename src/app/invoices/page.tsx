import Link from "next/link";
import { InvoicesManager } from "@/components/invoices-manager";
import { AppShell } from "@/components/ui";
import { btnPrimary } from "@/components/ui-styles";
import { requirePageUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const user = await requirePageUser();

  return (
    <AppShell
      userEmail={user.email}
      title="Invoices"
      subtitle="Search, filter and export your invoices as PDF."
      actions={
        <Link className={btnPrimary} href="/invoices/new">
          New invoice
        </Link>
      }
    >
      <InvoicesManager />
    </AppShell>
  );
}
