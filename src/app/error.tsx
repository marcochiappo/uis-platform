"use client";

import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-8 text-center" role="alert">
      <h1 className="font-serif text-2xl font-semibold text-brand-900">Something went wrong</h1>
      <p className="mt-2 text-muted">We couldn&apos;t load this page. Your data is safe. Please try again.</p>
      {error.digest && <p className="mt-2 text-xs text-muted">Reference: {error.digest}</p>}
      <div className="mt-6 flex justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          Try again
        </button>
        <Link href="/" className="btn-secondary">
          Go home
        </Link>
      </div>
    </div>
  );
}
