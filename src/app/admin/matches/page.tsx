import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminOnly } from "@/components/admin/guard";
import { AdminRequestCard } from "@/components/admin/request-card";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { adminListRequests } from "@/lib/services";

export const metadata: Metadata = { title: "Active matches" };

export default function AdminMatchesPage() {
  return (
    <>
      <PageHeader eyebrow="UIS admin" title="Active matches" description="Pairs UIS has introduced. Each one uses a spot of the mentor's capacity." />
      <Suspense fallback={<PageSkeleton />}>
        <AdminOnly path="/admin/matches">
          {async (ctx) => {
            const active = (await adminListRequests(ctx)).filter((v) => v.request.status === "introduced");
            return active.length === 0 ? (
              <EmptyState title="No active matches">When you confirm an accepted request, it appears here.</EmptyState>
            ) : (
              <ul className="space-y-4">
                {active.map((v) => (
                  <AdminRequestCard key={v.request.id} view={v} />
                ))}
              </ul>
            );
          }}
        </AdminOnly>
      </Suspense>
    </>
  );
}
