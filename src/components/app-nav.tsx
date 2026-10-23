"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/invoices", label: "Invoices" },
  { href: "/clients", label: "Clients" },
  { href: "/settings", label: "Settings" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Sticky app bar shown on every signed-in page. The link row scrolls
// horizontally instead of wrapping so 360px screens never get a second
// page-level scrollbar.
export function AppNav({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        <div className="flex items-center justify-between gap-4 py-3">
          <Link
            className="flex min-h-11 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            href="/dashboard"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-xs font-bold tracking-tight text-white">
              IM
            </span>
            <span className="text-sm font-semibold text-slate-900">
              Invoice Manager
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="hidden max-w-55 truncate rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 md:block">
              {userEmail}
            </span>
            <LogoutButton />
          </div>
        </div>

        <nav aria-label="Main navigation" className="scrollbar-thin -mb-px">
          <ul className="flex gap-1 overflow-x-auto pb-px">
            {links.map((link) => {
              const active = isActive(pathname, link.href);

              return (
                <li key={link.href}>
                  <Link
                    className={`relative flex min-h-11 items-center rounded-t-lg px-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:origin-center after:transition-transform after:duration-200 after:ease-out ${
                      active
                        ? "text-primary after:scale-x-100"
                        : "text-slate-500 after:scale-x-0 hover:text-slate-900 hover:after:scale-x-100"
                    }`}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
