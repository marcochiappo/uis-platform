import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm } from "@/components/admin/action-form";
import { AdminOnly } from "@/components/admin/guard";
import { Badge, EmptyState, formatDate, PageSkeleton } from "@/components/ui";
import { addSuppressionAction, removeSuppressionAction } from "@/app/recruitment-actions";
import { listSuppressions } from "@/lib/services";

export const metadata: Metadata = { title: "Do not contact" };

const REASONS = { unsubscribed: "Unsubscribed", admin: "Added by admin", bounced: "Bounced", complaint: "Spam complaint" } as const;

export default function DoNotContactPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminOnly path="/admin/prospects/do-not-contact">
        {async (ctx) => {
          const list = await listSuppressions(ctx);
          return (
            <div className="space-y-6">
              <section className="card max-w-2xl">
                <h2 className="font-serif text-xl font-semibold text-brand-900">Add an address</h2>
                <p className="mt-1 text-sm text-muted">
                  Addresses here are never emailed. The list is checked when drafting, approving and again right before sending.
                  Unsubscribes and bounces are added automatically.
                </p>
                <ActionForm action={addSuppressionAction} submitLabel="Add to list" buttonClass="btn-danger" className="mt-4 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="font-semibold">Email</span>
                      <input name="email" type="email" required maxLength={200} className="input mt-1" />
                    </label>
                    <label className="block text-sm">
                      <span className="font-semibold">Note</span>
                      <input name="note" maxLength={300} className="input mt-1" placeholder="e.g. Asked by phone not to be contacted" />
                    </label>
                  </div>
                </ActionForm>
              </section>
              {list.length === 0 ? (
                <EmptyState title="The do-not-contact list is empty" />
              ) : (
                <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
                  {list.map((s) => (
                    <li key={s.id} className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <span className="font-mono">{s.email}</span> <Badge>{REASONS[s.reason]}</Badge>
                        <p className="text-muted">
                          {formatDate(s.createdAt)}
                          {s.note ? ` · ${s.note}` : ""}
                        </p>
                      </div>
                      <ActionForm
                        action={removeSuppressionAction}
                        hidden={{ id: s.id }}
                        submitLabel="Remove"
                        buttonClass="btn-secondary"
                        className="space-y-1"
                        confirm={s.reason === "unsubscribed" ? "This person unsubscribed. Only remove them if they explicitly asked to hear from UIS again. Continue?" : undefined}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        }}
      </AdminOnly>
    </Suspense>
  );
}
