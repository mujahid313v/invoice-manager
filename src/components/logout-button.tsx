"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/components/spinner";
import { btnSecondary } from "@/components/ui-styles";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });

      if (!response.ok) {
        setError("Unable to sign out. Please try again.");
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <button
        className={`${btnSecondary} !min-h-10 !px-3.5 !py-2`}
        type="button"
        onClick={handleLogout}
        disabled={loading}
      >
        {loading ? (
          <>
            <Spinner className="size-3.5" />
            Signing out...
          </>
        ) : (
          "Sign out"
        )}
      </button>
      {error ? (
        <p className="anim-fade text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
