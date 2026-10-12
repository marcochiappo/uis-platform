"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";

const BASE = "rounded-lg px-3 py-2 text-sm font-medium transition-colors";
const INACTIVE = "text-muted hover:bg-slate-50 hover:text-ink";

/** Highlights the current section. Wrapped in Suspense because it reads the URL on dynamic routes. */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <Link href={href} className={`${BASE} ${INACTIVE}`}>
          {children}
        </Link>
      }
    >
      <ActiveNavLink href={href}>{children}</ActiveNavLink>
    </Suspense>
  );
}

function ActiveNavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${BASE} ${active ? "bg-brand-50 text-brand-800" : INACTIVE}`}
    >
      {children}
    </Link>
  );
}
