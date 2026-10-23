import { ClientsManager } from "@/components/clients-manager";
import { AppShell } from "@/components/ui";
import { requirePageUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const user = await requirePageUser();

  return (
    <AppShell
      userEmail={user.email}
      title="Clients"
      subtitle="Everyone you bill, with their contact details in one place."
    >
      <ClientsManager />
    </AppShell>
  );
}
