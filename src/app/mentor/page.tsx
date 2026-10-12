import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PauseToggle } from "@/components/mentor/pause-toggle";
import { TransitionButtons } from "@/components/request-actions";
import { StudentSummaryCard } from "@/components/student-summary";
import {
  Alert,
  Badge,
  EmptyState,
  formatDate,
  PageHeader,
  PageSkeleton,
  RequestStatusBadge,
  ReviewBadge,
  SignInRequired,
  Stat,
} from "@/components/ui";
import { remainingCapacity } from "@/lib/domain/matching";
import { getMessages } from "@/lib/i18n";
import { getContext } from "@/lib/server";
import { getProviderDashboard, type RequestView } from "@/lib/services";

export const metadata: Metadata = { title: "Mentor & tutor dashboard" };

const m = getMessages();

export default function MentorPage({ searchParams }: PageProps<"/mentor">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/mentor">["searchParams"] }) {
  const ctx = await getContext();
  if (!ctx.actor) return <SignInRequired next="/mentor" />;
  const [data, { saved }] = await Promise.all([getProviderDashboard(ctx), searchParams]);

  if (!data) {
    return (
      <>
        <PageHeader eyebrow="Mentor & tutor" title="Share your experience" />
        <EmptyState
          title="You haven't set up a mentor or tutor profile"
          action={
            <Link href="/onboarding/mentor" className="btn-primary">
              Create mentor/tutor profile
            </Link>
          }
        >
          Offer mentoring, tutoring, or both. UIS reviews every profile before students can see it.
        </EmptyState>
      </>
    );
  }

  const { provider: p, requests } = data;
  const pending = requests.filter((v) => v.request.status === "pending");
  const active = requests.filter((v) => v.request.status === "accepted" || v.request.status === "introduced");
  const past = requests.filter((v) => !["pending", "accepted", "introduced"].includes(v.request.status));
  const visible = p.reviewStatus === "approved" && p.directoryConsent && !p.isPaused && remainingCapacity(p) > 0;

  return (
    <>
      <PageHeader
        eyebrow="Mentor & tutor"
        title={p.fullName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ReviewBadge status={p.reviewStatus} />
            {p.offersMentoring && <Badge tone="brand">{m.services.mentoring}</Badge>}
            {p.offersTutoring && <Badge tone="warning">{m.services.tutoring}</Badge>}
            {p.isPaused && <Badge tone="danger">Paused</Badge>}
          </span>
        }
        actions={
          <Link href="/onboarding/mentor" className="btn-secondary">
            Edit profile
          </Link>
        }
      />

      <div className="mb-8 space-y-3">
        {saved && <Alert tone="success" title="Profile saved" />}
        {p.reviewStatus === "pending" && (
          <Alert tone="warning" title="Waiting for UIS review">
            Students can&apos;t see your profile until UIS approves it. We usually review within a few days.
          </Alert>
        )}
        {p.reviewStatus === "rejected" && (
          <Alert tone="danger" title="Your profile wasn't approved">
            {p.reviewNote ?? "No note was left."}{" "}
            <Link href="/onboarding/mentor" className="link">
              Update your profile
            </Link>{" "}
            to send it for review again.
          </Alert>
        )}
        {p.reviewStatus === "approved" && !p.directoryConsent && (
          <Alert tone="warning" title="You're hidden from the directory">
            You haven&apos;t given permission to appear to students, so you won&apos;t receive new requests.
          </Alert>
        )}
      </div>

      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        <Stat label="Active mentees" value={`${p.activeCount} / ${p.maxActiveMentees}`} />
        <Stat label="Waiting for your reply" value={pending.length} />
        <div className="card">
          <p className="text-sm text-muted">Visible to new students</p>
          <p className="mt-1 font-semibold">{visible ? "Yes" : "No"}</p>
          <div className="mt-3">
            <PauseToggle paused={p.isPaused} />
          </div>
        </div>
      </div>

      <RequestSection
        title="New requests"
        empty={visible ? "No new requests. Matching students will find you." : "No new requests."}
        items={pending}
        showMessage
      />
      <RequestSection title="Active mentees" empty="No active mentees yet." items={active} />
      {past.length > 0 && (
        <details className="mt-10">
          <summary className="cursor-pointer font-serif text-xl font-semibold text-brand-900">Past requests ({past.length})</summary>
          <div className="mt-4">
            <RequestSection title="" empty="" items={past} />
          </div>
        </details>
      )}
    </>
  );
}

function RequestSection({ title, empty, items, showMessage }: { title: string; empty: string; items: RequestView[]; showMessage?: boolean }) {
  return (
    <section className="mb-10" aria-label={title || "Past requests"}>
      {title && <h2 className="mb-4 font-serif text-2xl font-semibold text-brand-900">{title}</h2>}
      {items.length === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <ul className="space-y-4">
          {items.map((v) => (
            <li key={v.request.id} className="card">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <RequestStatusBadge status={v.request.status} />
                <Badge tone={v.request.service === "tutoring" ? "warning" : "brand"}>{m.services[v.request.service]}</Badge>
                <span className="text-sm text-muted">Received {formatDate(v.request.createdAt)}</span>
              </div>
              <StudentSummaryCard student={v.student} />
              {showMessage && v.request.message && (
                <blockquote className="mt-4 border-l-4 border-brand-200 pl-3 text-sm italic text-ink">“{v.request.message}”</blockquote>
              )}
              {v.request.status === "accepted" && (
                <p className="mt-3 text-sm text-muted">You accepted. UIS will confirm and introduce you both by email.</p>
              )}
              {v.request.status === "introduced" && (
                <p className="mt-3 text-sm text-emerald-800">Introduced on {formatDate(v.request.introducedAt)}. Continue by email.</p>
              )}
              <div className="mt-4">
                <TransitionButtons
                  requestId={v.request.id}
                  allowed={v.allowed}
                  confirmCopy={{
                    declined: "Decline this request? The student will see that it wasn't a fit.",
                    completed: "Mark this mentoring relationship as completed? This frees one mentee spot.",
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
