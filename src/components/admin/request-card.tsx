import { TransitionButtons } from "@/components/request-actions";
import { Badge, formatDate, RequestStatusBadge } from "@/components/ui";
import { getMessages } from "@/lib/i18n";
import type { AdminRequestView } from "@/lib/services";

const m = getMessages();

export function AdminRequestCard({ view }: { view: AdminRequestView }) {
  const r = view.request;
  return (
    <li className="card">
      <div className="flex flex-wrap items-center gap-2">
        <RequestStatusBadge status={r.status} />
        <Badge tone={r.service === "tutoring" ? "warning" : "brand"}>{m.services[r.service]}</Badge>
        {r.matchScore !== null && <Badge>Score {r.matchScore}</Badge>}
        <span className="ml-auto text-sm text-muted">
          Requested {formatDate(r.createdAt)}
          {r.respondedAt && ` · answered ${formatDate(r.respondedAt)}`}
          {r.introducedAt && ` · introduced ${formatDate(r.introducedAt)}`}
        </span>
      </div>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Student</dt>
          <dd className="mt-1">
            <p className="font-semibold">{view.student?.fullName ?? view.studentAccount?.fullName ?? "Unknown"}</p>
            <p className="text-muted">{view.studentAccount?.email}</p>
            {view.student && (
              <p className="text-muted">
                {view.student.degree} · {view.student.university}
              </p>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Mentor / tutor</dt>
          <dd className="mt-1">
            <p className="font-semibold">{view.providerName}</p>
            <p className="text-muted">{view.providerAccount?.email}</p>
            {view.providerHeadline && <p className="text-muted">{view.providerHeadline}</p>}
          </dd>
        </div>
      </dl>
      {r.message && <blockquote className="mt-4 border-l-4 border-brand-200 pl-3 text-sm italic">“{r.message}”</blockquote>}
      {r.matchReasons.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted">Why they matched (at request time)</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {r.matchReasons.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-4">
        <TransitionButtons
          requestId={r.id}
          allowed={view.allowed}
          confirmCopy={{
            introduced: "Confirm the introduction? An introduction email will be sent to both people (suppressed in demo mode).",
            cancelled: "Cancel this request? Both people will see it as cancelled by UIS.",
            completed: "Mark this match as completed?",
          }}
        />
      </div>
    </li>
  );
}
