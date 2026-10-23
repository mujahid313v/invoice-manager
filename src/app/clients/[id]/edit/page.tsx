import Link from "next/link";
import { ClientForm } from "@/components/client-form";
import { AppShell } from "@/components/ui";
import { btnSecondary } from "@/components/ui-styles";
import { requirePageUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type EditClientPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditClientPage({ params }: EditClientPageProps) {
  const user = await requirePageUser();
  const { id } = await params;

  return (
    <AppShell
      userEmail={user.email}
      title="Edit client"
      actions={
        <Link className={btnSecondary} href="/clients">
          Back to clients
        </Link>
      }
    >
      <ClientForm mode="edit" clientId={id} />
    </AppShell>
  );
}
