import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert, PageHeader, PageSkeleton, ReviewBadge, SignInRequired } from "@/components/ui";
import { getContext } from "@/lib/server";
import { getMyProfiles } from "@/lib/services";

export const metadata: Metadata = { title: "Get started" };

export default function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  return (
    <>
      <PageHeader
        eyebrow="Welcome"
        title="How would you like to take part?"
        description="Mentoring and tutoring are separate services. You can set up one profile or both, now or later."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Choices searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Choices({ searchParams }: { searchParams: PageProps<"/onboarding">["searchParams"] }) {
  const ctx = await getContext();
  if (!ctx.actor) return <SignInRequired next="/onboarding" />;
  const [{ student, provider }, { invited }] = await Promise.all([getMyProfiles(ctx), searchParams]);
  return (
    <div className="space-y-6">
      {invited && !provider && (
        <Alert tone="success" title="Thank you for accepting the UIS invitation">
          Next, create your mentor/tutor profile. You&apos;ll only appear to students after you give directory permission and UIS
          approves your profile.
        </Alert>
      )}
    <div className="grid gap-6 md:grid-cols-2">
      <div className="card flex flex-col">
        <h2 className="font-serif text-2xl font-semibold text-brand-900">I&apos;m looking for support</h2>
        <p className="mt-2 flex-1 text-muted">
          Get matched with mentors for career and university life, with academic tutors for specific subjects, or with both.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {student ? (
            <>
              <Link href="/student" className="btn-primary">
                See my matches
              </Link>
              <Link href="/onboarding/student" className="btn-secondary">
                Edit student profile
              </Link>
            </>
          ) : (
            <Link href="/onboarding/student" className="btn-primary">
              Create student profile
            </Link>
          )}
        </div>
      </div>
      <div className="card flex flex-col">
        <h2 className="font-serif text-2xl font-semibold text-brand-900">I want to offer support</h2>
        <p className="mt-2 flex-1 text-muted">
          Share your experience as a mentor, tutor, or both. UIS reviews every profile before students can see it.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {provider ? (
            <>
              <Link href="/mentor" className="btn-primary">
                Mentor dashboard
              </Link>
              <ReviewBadge status={provider.reviewStatus} />
            </>
          ) : (
            <Link href="/onboarding/mentor" className="btn-primary">
              Create mentor/tutor profile
            </Link>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}
