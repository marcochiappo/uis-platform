"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const TABS = [
  { href: "/admin/prospects", label: "Candidates", exact: true },
  { href: "/admin/prospects/search", label: "Apollo search" },
  { href: "/admin/prospects/import", label: "CSV import" },
  { href: "/admin/prospects/outreach", label: "Outreach queue" },
  { href: "/admin/prospects/settings", label: "Template & sending" },
  { href: "/admin/prospects/do-not-contact", label: "Do not contact" },
];

export function RecruitmentTabs() {
  return (
    <Suspense fallback={<Tabs pathname={null} />}>
      <CurrentTabs />
    </Suspense>
  );
}

function CurrentTabs() {
  return <Tabs pathname={usePathname()} />;
}

function Tabs({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Recruitment sections" className="-mx-1 flex gap-1 overflow-x-auto border-b border-line pb-px">
      {TABS.map((t) => {
        // Candidate detail pages (/admin/prospects/<id>) belong to the Candidates tab.
        const onOtherTab = TABS.some((x) => !x.exact && pathname?.startsWith(x.href));
        const active = pathname !== null && (t.exact ? !onOtherTab : pathname.startsWith(t.href));
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium ${
              active ? "border-brand-700 text-brand-800" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
