import type { Metadata } from "next";
import { Suspense } from "react";
import { StudentProfileForm } from "@/components/profile/student-profile-form";
import { PageHeader, PageSkeleton, SignInRequired } from "@/components/ui";
import { getContext } from "@/lib/server";
import { getMyProfiles } from "@/lib/services";

export const metadata: Metadata = { title: "Student profile" };

export default function StudentOnboardingPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Student profile"
        title="Tell us what you're looking for"
        description="We only use this information to suggest mentors and tutors and to explain why they match."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Form />
      </Suspense>
    </div>
  );
}

async function Form() {
  const ctx = await getContext();
  if (!ctx.actor) return <SignInRequired next="/onboarding/student" />;
  const { student } = await getMyProfiles(ctx);
  return <StudentProfileForm profile={student} defaultName={ctx.actor.fullName} />;
}
