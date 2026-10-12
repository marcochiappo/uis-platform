import Link from "next/link";
import type { ReactNode } from "react";
import type { RequestStatus, ReviewStatus } from "@/lib/domain/types";
import { getMessages } from "@/lib/i18n";

const m = getMessages();

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow && <p className="text-sm font-semibold uppercase tracking-wide text-accent-700">{eyebrow}</p>}
        <h1 className="font-serif text-3xl font-semibold text-brand-900 sm:text-4xl">{title}</h1>
        {description && <div className="mt-2 text-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-900 ring-amber-200",
  danger: "bg-red-50 text-red-800 ring-red-200",
  brand: "bg-brand-50 text-brand-800 ring-brand-200",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<RequestStatus, Tone> = {
  pending: "warning",
  accepted: "info",
  introduced: "success",
  completed: "neutral",
  declined: "neutral",
  withdrawn: "neutral",
  cancelled: "danger",
};

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{m.requestStatusShort[status]}</Badge>;
}

const REVIEW_TONE: Record<ReviewStatus, Tone> = { pending: "warning", approved: "success", rejected: "danger" };

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  return <Badge tone={REVIEW_TONE[status]}>{m.reviewStatus[status]}</Badge>;
}

export function DemoBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center rounded-md border border-dashed border-accent-600 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent-700">
      {m.demo.badge}
    </span>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: string;
  children?: ReactNode;
}) {
  const styles = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-900",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1" : ""}>{children}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-line bg-white/60 px-6 py-10 text-center">
      <h3 className="font-serif text-lg font-semibold text-brand-900">{title}</h3>
      {children && <div className="mx-auto mt-2 max-w-xl text-sm text-muted">{children}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Skeleton({ lines = 3, label = m.common.loading }: { lines?: number; label?: string }) {
  return (
    <div className="card" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="animate-pulse space-y-3" aria-hidden="true">
        <div className="h-5 w-1/3 rounded bg-slate-200" />
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="h-4 rounded bg-slate-100" style={{ width: `${90 - i * 12}%` }} />
        ))}
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-10 w-64 animate-pulse rounded bg-slate-200" aria-hidden="true" />
      <Skeleton lines={4} />
      <Skeleton lines={3} />
    </div>
  );
}

export function SignInRequired({ next }: { next: string }) {
  return (
    <EmptyState
      title="Please sign in"
      action={
        <Link className="btn-primary" href={`/login?next=${encodeURIComponent(next)}`}>
          {m.nav.signIn}
        </Link>
      }
    >
      You need a UIS account to see this page.
    </EmptyState>
  );
}

export function Forbidden({ children }: { children?: ReactNode }) {
  return (
    <EmptyState title="You don't have access to this page" action={<Link className="btn-secondary" href="/dashboard">Go to your dashboard</Link>}>
      {children ?? "This area is restricted."}
    </EmptyState>
  );
}

export function TagList({ items, empty = m.common.none }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <span className="text-sm text-muted">{empty}</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <li key={t} className="rounded-md bg-slate-100 px-2 py-0.5 text-sm text-slate-700">
          {t}
        </li>
      ))}
    </ul>
  );
}

export function Stat({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const body = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-serif text-3xl font-semibold text-brand-900">{value}</p>
    </>
  );
  return href ? (
    <Link href={href} className="card block transition hover:border-brand-200 hover:shadow">
      {body}
    </Link>
  ) : (
    <div className="card">{body}</div>
  );
}

export function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}
