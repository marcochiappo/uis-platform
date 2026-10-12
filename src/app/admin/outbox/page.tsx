import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminOnly } from "@/components/admin/guard";
import { Alert, Badge, EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { isDemoMode } from "@/lib/config";
import { adminListEmails } from "@/lib/services";

export const metadata: Metadata = { title: "Email outbox" };

export default function OutboxPage() {
  return (
    <>
      <PageHeader eyebrow="UIS admin" title="Email outbox" description="Emails the platform would have sent." />
      <Suspense fallback={<PageSkeleton />}>
        <AdminOnly path="/admin/outbox">
          {async (ctx) => {
            if (!isDemoMode()) return <Alert tone="info">The outbox is only recorded in demo mode.</Alert>;
            const emails = await adminListEmails(ctx);
            return (
              <div className="space-y-6">
                <Alert tone="warning" title="Email sending is disabled in demo mode">
                  Nothing on this page was delivered. Messages are only recorded locally so you can review them.
                </Alert>
                {emails.length === 0 ? (
                  <EmptyState title="No emails yet">Confirm an accepted request to generate an introduction email.</EmptyState>
                ) : (
                  <ul className="space-y-4">
                    {emails.map((e) => (
                      <li key={e.id} className="card">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="warning">Not sent (demo)</Badge>
                          <span className="text-sm text-muted">{new Date(e.createdAt).toLocaleString("en-GB")}</span>
                        </div>
                        <p className="mt-2 font-semibold">{e.subject}</p>
                        <p className="text-sm text-muted">To: {e.to.join(", ")}</p>
                        <pre className="mt-3 rounded-lg bg-slate-50 p-3 font-sans text-sm whitespace-pre-wrap">{e.body}</pre>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          }}
        </AdminOnly>
      </Suspense>
    </>
  );
}
