import { BusinessProfileForm } from "@/components/business-profile-form";
import { AppShell } from "@/components/ui";
import { requirePageUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requirePageUser();

  return (
    <AppShell
      userEmail={user.email}
      title="Settings"
      subtitle="The seller details that appear on every invoice you create."
    >
      <BusinessProfileForm />
    </AppShell>
  );
}
