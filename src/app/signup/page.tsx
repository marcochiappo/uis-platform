import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/auth/auth-forms";
import { Suspense } from "react";
import { isDemoMode } from "@/lib/config";

export const metadata: Metadata = { title: "Join UIS" };

export default function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const demo = isDemoMode();
  return (
    <div className="mx-auto grid max-w-4xl gap-10 md:grid-cols-2">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-brand-900">Join UIS</h1>
        <p className="mt-3 text-muted">
          One account for everything: look for a mentor or tutor, offer your own experience, or do both.
        </p>
        <ul className="mt-6 space-y-3 text-sm text-muted">
          <li>✓ Your email and contact details stay private. Only UIS staff can see them.</li>
          <li>✓ Mentors and tutors are reviewed by UIS before they appear to students.</li>
          <li>✓ You can pause, edit, or withdraw at any time.</li>
        </ul>
        <p className="mt-6 text-sm">
          Already a member?{" "}
          <Link href="/login" className="link">
            Sign in
          </Link>
        </p>
      </div>
      <div className="card">
        <Suspense fallback={<SignUpForm demo={demo} />}>
          <InviteAwareForm demo={demo} searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function InviteAwareForm({ demo, searchParams }: { demo: boolean; searchParams: PageProps<"/signup">["searchParams"] }) {
  const { invite } = await searchParams;
  return <SignUpForm demo={demo} invite={typeof invite === "string" ? invite.slice(0, 200) : undefined} />;
}
