import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/admin/action-form";
import { AdminOnly } from "@/components/admin/guard";
import { OutreachBadge } from "@/components/admin/recruitment-badges";
import { Alert, EmptyState, formatDate, PageSkeleton, Stat } from "@/components/ui";
import { retryMessageAction, sendBatchAction } from "@/app/recruitment-actions";
import type { OutreachStatus } from "@/lib/domain/types";
import { getSendingInfo, listCandidates, type ServiceContext } from "@/lib/services";

export const metadata: Metadata = { title: "Outreach queue" };

export default function OutreachPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminOnly path="/admin/prospects/outreach">{async (ctx) => <Queue ctx={ctx} />}</AdminOnly>
    </Suspense>
  );
}

async function Queue({ ctx }: { ctx: ServiceContext }) {
  const [info, rows, messages] = await Promise.all([getSendingInfo(ctx), listCandidates(ctx), ctx.store.listOutreachMessages()]);
  const names = new Map(rows.map((r) => [r.prospect.id, r.prospect.fullName]));
  const by = (s: OutreachStatus) => messages.filter((x) => x.status === s);
  const approved = by("approved");
  const groups: { title: string; status: OutreachStatus[]; hint?: string }[] = [
    { title: "Approved, waiting to send", status: ["approved"] },
    { title: "Needs attention", status: ["failed", "bounced", "sending"], hint: "Delivery failures and sends whose outcome wasn't recorded. These are not replies." },
    { title: "Drafts awaiting approval", status: ["draft"] },
    { title: "Sent", status: ["sent"] },
    { title: "Mock only (not delivered)", status: ["mock_logged"] },
  ];

  return (
    <div className="space-y-8">
      {info.live ? (
        <Alert tone="success" title="Real sending is ON">
          Approved invitations are delivered through the configured email account, up to {info.batchLimit} per batch.
        </Alert>
      ) : (
        <Alert tone="warning" title="Real sending is OFF">
          {info.reasons.join(" ")} Running a batch now only records messages with the MOCK adapter. Nothing is delivered and
          candidates are not marked as invited.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Approved" value={approved.length} />
        <Stat label="Drafts" value={by("draft").length} />
        <Stat label="Sent" value={by("sent").length} />
        <Stat label="Failed / bounced" value={by("failed").length + by("bounced").length} />
      </div>

      <section className="card space-y-3">
        <h2 className="font-serif text-xl font-semibold text-brand-900">Send next batch</h2>
        <p className="text-sm text-muted">
          Sends up to {info.batchLimit} approved message{info.batchLimit === 1 ? "" : "s"}, oldest approval first. Each one is
          re-checked against the do-not-contact list and its approved text just before sending. A candidate can never receive a
          second invitation, even if this is clicked twice or retried.
        </p>
        <ActionForm
          action={sendBatchAction}
          submitLabel={info.live ? `Send up to ${info.batchLimit} invitations` : `Run MOCK batch (${Math.min(info.batchLimit, approved.length)} message${approved.length === 1 ? "" : "s"}, nothing delivered)`}
          pendingLabel="Sending…"
          disabled={approved.length === 0}
          confirm={info.live ? `Send up to ${info.batchLimit} real emails now?` : undefined}
        />
      </section>

      {messages.length === 0 && (
        <EmptyState title="No invitations yet" action={<Link href="/admin/prospects" className="btn-secondary">Go to candidates</Link>}>
          Draft invitations from a candidate&apos;s page after reviewing them.
        </EmptyState>
      )}

      {groups.map((g) => {
        const items = messages.filter((x) => g.status.includes(x.status));
        if (items.length === 0) return null;
        return (
          <section key={g.title} aria-label={g.title}>
            <h2 className="font-serif text-xl font-semibold text-brand-900">
              {g.title} <span className="text-base font-normal text-muted">({items.length})</span>
            </h2>
            {g.hint && <p className="text-sm text-muted">{g.hint}</p>}
            <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-white">
              {items.map((x) => (
                <li key={x.id} className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <Link href={`/admin/prospects/${x.prospectId}#outreach`} className="link font-semibold">
                      {names.get(x.prospectId) ?? "Candidate"}
                    </Link>
                    <p className="truncate text-muted">{x.subject}</p>
                    {x.lastError && <p className="text-red-800">{x.lastError}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                    <OutreachBadge status={x.status} />
                    <span className="text-xs text-muted">
                      {x.sentAt ? `Sent ${formatDate(x.sentAt)}` : x.approvedAt ? `Approved ${formatDate(x.approvedAt)}` : `Created ${formatDate(x.createdAt)}`}
                    </span>
                    {x.status === "failed" && <ActionForm action={retryMessageAction} hidden={{ id: x.id }} submitLabel="Retry" buttonClass="btn-secondary" className="space-y-1" />}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
