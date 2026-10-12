import { NavLink } from "@/components/nav-link";
import { isDemoMode } from "@/lib/config";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="grid gap-8 lg:grid-cols-[13rem_1fr]">
      <nav aria-label="Admin sections" className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted">UIS admin</p>
        <div className="flex flex-wrap gap-1 lg:flex-col">
          <NavLink href="/admin/overview">Overview</NavLink>
          <NavLink href="/admin/profiles">Profile review</NavLink>
          <NavLink href="/admin/requests">Requests</NavLink>
          <NavLink href="/admin/matches">Active matches</NavLink>
          <NavLink href="/admin/prospects">Mentor recruitment</NavLink>
          {isDemoMode() && <NavLink href="/admin/outbox">Email outbox</NavLink>}
        </div>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
