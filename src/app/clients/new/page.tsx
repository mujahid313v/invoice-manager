import Link from "next/link";
import { ClientForm } from "@/components/client-form";
import { AppShell } from "@/components/ui";
import { btnSecondary } from "@/components/ui-styles";
import { requirePageUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  const user = await requirePageUser();

  return (
    <AppShell
      userEmail={user.email}
      title="New client"
      actions={
        <Link className={btnSecondary} href="/clients">
          Back to clients
        </Link>
      }
    >
      <ClientForm mode="create" />
    </AppShell>
  );
}
