import type { Metadata } from "next";
import { ProspectImportForm } from "@/components/admin/admin-forms";
import { Alert } from "@/components/ui";

export const metadata: Metadata = { title: "Import candidates" };

export default function ImportPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <Alert tone="info" title="Only import contacts you selected yourself">
        Use this for people UIS already knows or picked by hand. Don&apos;t paste scraped lists. Each row is saved with
        source &ldquo;CSV import&rdquo; and today&apos;s date, starts as <em>not reviewed</em>, and gets no community label.
        A <code>community_note</code> is kept as an unconfirmed signal for you to review.
      </Alert>
      <section className="card">
        <h2 className="mb-4 font-serif text-xl font-semibold text-brand-900">Upload CSV</h2>
        <ProspectImportForm />
      </section>
    </div>
  );
}
