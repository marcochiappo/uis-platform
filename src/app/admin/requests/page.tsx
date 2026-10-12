import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminOnly } from "@/components/admin/guard";
import { AdminRequestCard } from "@/components/admin/request-card";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { adminListRequests, type AdminRequestView } from "@/lib/services";

export const metadata: Metadata = { title: "Requests" };

export default function AdminRequestsPage() {
  return (
    <>
      <PageHeader
        eyebrow="UIS admin"
        title="Introduction requests"
        description="Mentors accept or decline. UIS confirms accepted requests and makes the introduction by email."
      />
      <Suspense fallback={<PageSkeleton />}>
        <AdminOnly path="/admin/requests">
          {async (ctx) => {
            const all = await adminListRequests(ctx);
            const groups: { title: string; empty: string; items: AdminRequestView[] }[] = [
              { title: "Accepted — ready to introduce", empty: "Nothing waiting for an introduction.", items: all.filter((v) => v.request.status === "accepted") },
              { title: "Waiting for the mentor's reply", empty: "No pending requests.", items: all.filter((v) => v.request.status === "pending") },
              { title: "Closed", empty: "No closed requests yet.", items: all.filter((v) => ["declined", "withdrawn", "completed", "cancelled"].includes(v.request.status)) },
            ];
            return (
              <div className="space-y-10">
                {groups.map((g) => (
                  <section key={g.title}>
                    <h2 className="mb-4 font-serif text-2xl font-semibold text-brand-900">
                      {g.title} <span className="text-base font-normal text-muted">({g.items.length})</span>
                    </h2>
                    {g.items.length === 0 ? (
                      <EmptyState title={g.empty} />
                    ) : (
                      <ul className="space-y-4">
                        {g.items.map((v) => (
                          <AdminRequestCard key={v.request.id} view={v} />
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
                <p className="text-sm text-muted">Active matches (introduced) are on the Active matches page.</p>
              </div>
            );
          }}
        </AdminOnly>
      </Suspense>
    </>
  );
}
