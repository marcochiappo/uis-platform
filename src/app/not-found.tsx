import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-accent-700">404</p>
      <h1 className="mt-2 font-serif text-3xl font-semibold text-brand-900">Page not found</h1>
      <p className="mt-2 text-muted">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
      <Link href="/" className="btn-primary mt-6">
        Go home
      </Link>
    </div>
  );
}
