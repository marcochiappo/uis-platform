import type { Metadata } from "next";
import { Suspense } from "react";
import { UnsubscribeForm } from "@/components/unsubscribe-form";
import { Skeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

export default function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-serif text-3xl font-semibold text-brand-900">Stop emails from UIS</h1>
      <p className="mt-3 text-muted">
        Confirm below and UIS won&apos;t contact this address about mentoring again. You don&apos;t need an account.
      </p>
      <div className="card mt-6">
        <Suspense fallback={<Skeleton lines={2} />}>
          <Token searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Token({ searchParams }: { searchParams: PageProps<"/unsubscribe">["searchParams"] }) {
  const { t } = await searchParams;
  return <UnsubscribeForm token={typeof t === "string" ? t : ""} />;
}
