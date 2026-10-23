import type { ReactNode } from "react";
import { AppNav } from "@/components/app-nav";
import { Spinner } from "@/components/spinner";
import { emptyStateClass } from "@/components/ui-styles";

export { Spinner };

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1.5 break-words text-sm text-slate-600">{subtitle}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-3">{actions}</div>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  children,
}: {
  title: string;
  message: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`${emptyStateClass} anim-rise`}>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
        {message}
      </p>
      {children ? (
        <div className="mt-5 flex flex-wrap justify-center gap-3">{children}</div>
      ) : null}
    </div>
  );
}

// Standard signed-in page frame: sticky nav bar plus a centered content
// column. Pages keep their own CTA/back links through `actions`.
export function AppShell({
  userEmail,
  title,
  subtitle,
  actions,
  children,
}: {
  userEmail: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <AppNav userEmail={userEmail} />
      <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
        <PageHeader title={title} subtitle={subtitle} actions={actions} />
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}
