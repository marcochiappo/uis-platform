import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetDemoButton } from "@/components/admin/admin-forms";
import { AdminOnly } from "@/components/admin/guard";
import { PageHeader, PageSkeleton, Stat } from "@/components/ui";
import { isDemoMode } from "@/lib/config";
import { adminOverview } from "@/lib/services";

export const metadata: Metadata = { title: "Admin overview" };

export default function AdminOverviewPage() {
  return (
    <>
      <PageHeader eyebrow="UIS admin" title="Overview" description="What needs attention across the community." />
      <Suspense fallback={<PageSkeleton />}>
        <AdminOnly path="/admin/overview">
          {async (ctx) => {
            const o = await adminOverview(ctx);
            return (
              <div className="space-y-8">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <Stat label="Profiles awaiting review" value={o.pendingReviews} href="/admin/profiles" />
                  <Stat label="Accepted — awaiting introduction" value={o.awaitingIntroduction} href="/admin/requests" />
                  <Stat label="Requests awaiting mentor reply" value={o.pendingRequests} href="/admin/requests" />
                  <Stat label="Active matches" value={o.activeMatches} href="/admin/matches" />
                  <Stat label="Listed mentors & tutors" value={o.listedProviders} href="/admin/profiles" />
                  <Stat label="Students" value={o.students} href="/admin/profiles#students" />
                  <Stat label="Recruitment prospects (not registered)" value={o.prospects} href="/admin/prospects" />
                </div>
                {isDemoMode() && (
                  <section className="card">
                    <h2 className="font-serif text-xl font-semibold text-brand-900">Demo data</h2>
                    <p className="mt-1 mb-4 text-sm text-muted">
                      Demo data is stored in <code>.demo-data/db.json</code> on this server. Resetting restores the fictional seed
                      data and removes accounts created during the demo.
                    </p>
                    <ResetDemoButton />
                  </section>
                )}
              </div>
            );
          }}
        </AdminOnly>
      </Suspense>
    </>
  );
}
