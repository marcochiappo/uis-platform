import type { Metadata } from "next";
import { Suspense } from "react";
import { ProviderProfileForm } from "@/components/profile/provider-profile-form";
import { Alert, PageHeader, PageSkeleton, SignInRequired } from "@/components/ui";
import { getContext } from "@/lib/server";
import { getMyProfiles } from "@/lib/services";

export const metadata: Metadata = { title: "Mentor & tutor profile" };

export default function MentorOnboardingPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Mentor & tutor profile"
        title="Share your experience"
        description="Tell students how you can help. You decide how many mentees you take on and can pause at any time."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Form />
      </Suspense>
    </div>
  );
}

async function Form() {
  const ctx = await getContext();
  if (!ctx.actor) return <SignInRequired next="/onboarding/mentor" />;
  const { provider, account } = await getMyProfiles(ctx);
  return (
    <div className="space-y-6">
      {provider?.reviewStatus === "rejected" && (
        <Alert tone="warning" title="Your profile wasn't approved">
          {provider.reviewNote ?? "UIS left no note."} Saving changes sends your profile back for review.
        </Alert>
      )}
      <ProviderProfileForm profile={provider} defaultName={ctx.actor.fullName} linkedinUrl={account?.linkedinUrl ?? null} />
    </div>
  );
}
