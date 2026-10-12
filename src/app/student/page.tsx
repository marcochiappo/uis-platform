import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TransitionButtons } from "@/components/request-actions";
import { MatchCard } from "@/components/student/match-card";
import {
  Alert,
  Badge,
  EmptyState,
  formatDate,
  PageHeader,
  PageSkeleton,
  RequestStatusBadge,
  SignInRequired,
} from "@/components/ui";
import type { ExclusionCode, MatchResult } from "@/lib/domain/matching";
import type { ServiceType } from "@/lib/domain/options";
import { getMessages } from "@/lib/i18n";
import { getContext } from "@/lib/server";
import { getStudentDashboard, type RequestView } from "@/lib/services";

export const metadata: Metadata = { title: "Find support" };

const m = getMessages();

export default function StudentPage({ searchParams }: PageProps<"/student">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/student">["searchParams"] }) {
  const ctx = await getContext();
  if (!ctx.actor) return <SignInRequired next="/student" />;
  const [data, { saved }] = await Promise.all([getStudentDashboard(ctx), searchParams]);

  if (!data) {
    return (
      <>
        <PageHeader eyebrow="Find support" title="Find a mentor or tutor" />
        <EmptyState
          title="Create your student profile to see matches"
          action={
            <Link href="/onboarding/student" className="btn-primary">
              Create student profile
            </Link>
          }
        >
          We match you on your goals, subjects, level of study, languages and availability, and we show exactly why each person
          was suggested.
        </EmptyState>
      </>
    );
  }

  const { student, result, requests, openRequestKeys } = data;
  const open = new Set(openRequestKeys);
  return (
    <>
      <PageHeader
        eyebrow="Find support"
        title={`Welcome, ${student.fullName.split(" ")[0]}`}
        description={
          <>
            Looking for <strong>{m.seeking[student.seeking].toLowerCase()}</strong> · {m.levels[student.degreeLevel]} ·{" "}
            {student.university}
          </>
        }
        actions={
          <Link href="/onboarding/student" className="btn-secondary">
            Edit profile
          </Link>
        }
      />
      {saved && (
        <div className="mb-6">
          <Alert tone="success" title="Profile saved">
            Your matches below are updated.
          </Alert>
        </div>
      )}

      <section aria-labelledby="requests-h" className="mb-12">
        <h2 id="requests-h" className="mb-4 font-serif text-2xl font-semibold text-brand-900">
          Your requests
        </h2>
        {requests.length === 0 ? (
          <EmptyState title="No requests yet">Choose a match below and request an introduction. Its status will appear here.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {requests.map((v) => (
              <RequestRow key={v.request.id} view={v} />
            ))}
          </ul>
        )}
      </section>

      {result.services.map((service) => (
        <ServiceMatches key={service} service={service} result={result} open={open} />
      ))}
    </>
  );
}

function RequestRow({ view }: { view: RequestView }) {
  const r = view.request;
  return (
    <li className="card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <RequestStatusBadge status={r.status} />
            <Badge tone={r.service === "tutoring" ? "warning" : "brand"}>{m.services[r.service]}</Badge>
          </div>
          <p className="mt-2 font-semibold">{view.providerName}</p>
          <p className="text-sm text-muted">
            {m.requestStatus[r.status]} · requested {formatDate(r.createdAt)}
            {r.matchScore !== null && ` · match score ${r.matchScore}`}
          </p>
          {r.status === "introduced" && (
            <p className="mt-2 text-sm text-emerald-800">UIS has introduced you by email. Check your inbox to arrange a first meeting.</p>
          )}
          {r.status === "declined" && (
            <p className="mt-2 text-sm text-muted">This mentor isn&apos;t able to help right now. Try another match below.</p>
          )}
        </div>
        <TransitionButtons
          requestId={r.id}
          allowed={view.allowed}
          confirmCopy={{ withdrawn: `Withdraw your request to ${view.providerName}?` }}
        />
      </div>
    </li>
  );
}

function ServiceMatches({ service, result, open }: { service: ServiceType; result: MatchResult; open: Set<string> }) {
  const matches = result.matches.filter((x) => x.service === service);
  const missing = result.missingStudentInfo[service];
  const excluded = Object.entries(result.excluded[service]) as [ExclusionCode, number][];
  return (
    <section aria-labelledby={`${service}-h`} className="mb-12">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${service}-h`} className="font-serif text-2xl font-semibold text-brand-900">
          {m.services[service]} matches
        </h2>
        <p className="text-sm text-muted">
          {matches.length} {matches.length === 1 ? "person meets" : "people meet"} every requirement
        </p>
      </div>
      {matches.length > 0 ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {matches.map((match) => (
            <MatchCard key={`${match.provider.userId}-${service}`} match={match} requested={open.has(`${match.provider.userId}:${service}`)} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={`No ${service === "tutoring" ? "tutors" : "mentors"} meet your requirements yet`}
          action={
            <Link href="/onboarding/student" className="btn-secondary">
              Review your profile
            </Link>
          }
        >
          {missing === "subjects" && <p>Add at least one subject to your profile so we can look for tutors.</p>}
          {missing === "goals_or_career" && <p>Add a mentoring goal or career area so we can look for mentors.</p>}
          {!missing && (
            <>
              <p>
                {service === "tutoring"
                  ? "Tutors must teach one of your subjects at your level and share a language with you."
                  : "Mentors must cover one of your goals or career areas and share a language with you."}{" "}
                We won&apos;t suggest anyone who doesn&apos;t.
              </p>
              {excluded.length > 0 && (
                <p className="mt-2">
                  Among listed {service === "tutoring" ? "tutors" : "mentors"}:{" "}
                  {excluded.map(([code, n]) => m.matching.exclusions[code](n)).join("; ")}.
                </p>
              )}
              <p className="mt-2">UIS is recruiting new mentors and tutors. Check back soon, or widen your subjects, goals or languages.</p>
            </>
          )}
        </EmptyState>
      )}
    </section>
  );
}
