import Link from "next/link";
import { getMessages } from "@/lib/i18n";

const m = getMessages();

const steps = [
  {
    title: "Tell us what you need",
    body: "Your university, goals, subjects, languages and when you're free. It takes about five minutes.",
  },
  {
    title: "See transparent matches",
    body: "Every suggested mentor or tutor comes with a score and the exact profile details behind it.",
  },
  {
    title: "UIS makes the introduction",
    body: "When a mentor accepts, our team introduces you by email. Contact details are never shown on the site.",
  },
];

export default function Home() {
  return (
    <div className="space-y-16">
      <section className="grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-accent-700">Italian community · more to come</p>
          <h1 className="mt-3 font-serif text-4xl font-semibold text-brand-900 sm:text-5xl">
            Find the mentor or tutor who has walked your path.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            {m.app.fullName} connects international students with experienced mentors and academic tutors from their own
            community, matched on goals, subjects, language and schedule.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="btn-primary px-6 py-3 text-base">
              Join UIS
            </Link>
            <Link href="/login" className="btn-secondary px-6 py-3 text-base">
              Sign in
            </Link>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <div className="card border-l-4 border-l-brand-700">
            <h2 className="font-serif text-xl font-semibold text-brand-900">{m.services.mentoring}</h2>
            <p className="mt-2 text-muted">
              Career direction, internships, graduate school and settling into a new country, with professionals
              who have done it.
            </p>
          </div>
          <div className="card border-l-4 border-l-accent-600">
            <h2 className="font-serif text-xl font-semibold text-brand-900">{m.services.tutoring}</h2>
            <p className="mt-2 text-muted">
              Subject help from tutors who teach your subject at your level, in a language you&apos;re comfortable with.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="how">
        <h2 id="how" className="font-serif text-2xl font-semibold text-brand-900">
          How it works
        </h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="card">
              <span className="grid size-8 place-items-center rounded-full bg-brand-50 font-semibold text-brand-800" aria-hidden="true">
                {i + 1}
              </span>
              <h3 className="mt-3 font-semibold text-ink">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="card grid gap-6 bg-brand-900 text-white md:grid-cols-[2fr_1fr] md:items-center" aria-labelledby="offer">
        <div>
          <h2 id="offer" className="font-serif text-2xl font-semibold">
            Want to give back?
          </h2>
          <p className="mt-2 text-brand-100">
            Mentor, tutor, or both. You decide how many mentees you can take on and can pause any time. The same account can
            also look for support.
          </p>
        </div>
        <div className="md:text-right">
          <Link href="/signup" className="btn bg-white text-brand-900 hover:bg-brand-50">
            Become a mentor or tutor
          </Link>
        </div>
      </section>
    </div>
  );
}
