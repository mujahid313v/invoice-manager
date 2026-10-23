import Link from "next/link";
import { headers } from "next/headers";
import { DashboardContent } from "@/components/dashboard-content";
import { AppShell } from "@/components/ui";
import { btnPrimary } from "@/components/ui-styles";
import { requirePageUser } from "@/lib/auth";
import { getDashboardForUser } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requirePageUser();
  // The page loads the aggregates directly through the same function the
  // API route uses: no self-fetch, and the numbers cannot diverge.
  const dashboard = await getDashboardForUser(user.id);
  const acceptLanguage = (await headers()).get("accept-language");

  return (
    <AppShell
      userEmail={user.email}
      title="Dashboard"
      actions={
        <Link className={btnPrimary} href="/invoices/new">
          New invoice
        </Link>
      }
    >
      <DashboardContent data={dashboard} acceptLanguage={acceptLanguage} />
    </AppShell>
  );
}
