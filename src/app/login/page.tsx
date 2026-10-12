import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { demoSignIn } from "@/app/actions";
import { SignInForm } from "@/components/auth/auth-forms";
import { Alert, Badge, Skeleton } from "@/components/ui";
import { isDemoMode } from "@/lib/config";
import { getDemoStore } from "@/lib/server";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  const demo = isDemoMode();
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-serif text-3xl font-semibold text-brand-900">Sign in</h1>
      <Suspense fallback={null}>
        <LoginError searchParams={searchParams} />
      </Suspense>
      {demo ? (
        <Suspense fallback={<Skeleton lines={6} label="Loading demo accounts…" />}>
          <DemoAccounts />
        </Suspense>
      ) : (
        <div className="card mt-6 max-w-md">
          <SignInForm />
        </div>
      )}
    </div>
  );
}

async function LoginError({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { error } = await searchParams;
  if (!error) return null;
  return (
    <div className="mt-4">
      <Alert tone="danger" title="Couldn't sign you in">
        {error === "confirm" ? "That confirmation link is invalid or has expired." : "Please try again."}
      </Alert>
    </div>
  );
}

const DESCRIPTIONS: Record<string, string> = {
  admin: "UIS staff — review profiles, confirm introductions, import prospects",
  luca: "Undergraduate seeking tutoring in calculus and physics",
  sofia: "Master's student seeking finance mentoring (has a pending request)",
  matteo: "Seeks mentoring and tutoring, and also tutors Italian",
  giulia: "Seeks graduate organic chemistry tutoring (shows the no-match state)",
  anna: "Student with an active mentoring match",
  elena: "Physics tutor and academic mentor",
  marco: "Finance mentor with a pending request and an active mentee",
  francesca: "Tech mentor and programming tutor (accepted request awaiting UIS)",
  andrea: "Chemistry tutor (high school and undergraduate)",
  paolo: "Consulting mentor, currently paused",
  valentina: "Mentor waiting for UIS review",
  roberto: "Approved tutor who opted out of the directory",
};

async function DemoAccounts() {
  const accounts = await getDemoStore().listAccounts();
  const [students, providers] = await Promise.all([
    getDemoStore().listStudentProfiles(),
    getDemoStore().listProviderProfiles(),
  ]);
  const isStudent = new Set(students.map((s) => s.userId));
  const isProvider = new Set(providers.map((p) => p.userId));
  const groups = [
    { title: "UIS staff", items: accounts.filter((a) => a.role === "admin") },
    { title: "Students", items: accounts.filter((a) => a.role !== "admin" && isStudent.has(a.id)) },
    { title: "Mentors & tutors", items: accounts.filter((a) => a.role !== "admin" && !isStudent.has(a.id) && isProvider.has(a.id)) },
    { title: "Other accounts", items: accounts.filter((a) => a.role !== "admin" && !isStudent.has(a.id) && !isProvider.has(a.id)) },
  ].filter((g) => g.items.length);

  return (
    <div className="mt-6 space-y-6">
      <Alert tone="info" title="Demo mode">
        Choose any fictional account to explore the platform. No password is needed and nothing leaves this computer. Or{" "}
        <Link href="/signup" className="link">
          create your own demo account
        </Link>
        .
      </Alert>
      {groups.map((g) => (
        <section key={g.title} aria-labelledby={`g-${g.title}`}>
          <h2 id={`g-${g.title}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            {g.title}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {g.items.map((a) => {
              const key = a.email.split("@")[0];
              return (
                <li key={a.id}>
                  <form action={demoSignIn}>
                    <input type="hidden" name="userId" value={a.id} />
                    <button
                      type="submit"
                      className="flex h-full w-full flex-col items-start gap-1 rounded-xl border border-line bg-white p-4 text-left transition hover:border-brand-500 hover:shadow-sm"
                    >
                      <span className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                        {a.fullName}
                        {isStudent.has(a.id) && isProvider.has(a.id) && <Badge tone="brand">Student + tutor</Badge>}
                        {!a.isDemo && <Badge>Created by you</Badge>}
                      </span>
                      <span className="text-sm text-muted">{DESCRIPTIONS[key] ?? a.email}</span>
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
