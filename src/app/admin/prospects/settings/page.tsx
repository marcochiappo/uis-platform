import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm } from "@/components/admin/action-form";
import { AdminOnly } from "@/components/admin/guard";
import { Alert, PageSkeleton } from "@/components/ui";
import { saveSettingsAction } from "@/app/recruitment-actions";
import { LINK_PLACEHOLDERS, PERSONAL_PLACEHOLDERS } from "@/lib/domain/recruitment";
import { getOutreachSettings, getSendingInfo } from "@/lib/services";

export const metadata: Metadata = { title: "Invitation template" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminOnly path="/admin/prospects/settings">
        {async (ctx) => {
          const [s, info] = await Promise.all([getOutreachSettings(ctx), getSendingInfo(ctx)]);
          const configured = info.reasons.every((r) => r.startsWith("Sending is switched off"));
          return (
            <ActionForm action={saveSettingsAction} submitLabel="Save settings" className="max-w-3xl space-y-6">
              <section className="card space-y-4">
                <h2 className="font-serif text-xl font-semibold text-brand-900">Invitation template</h2>
                <p className="text-sm text-muted">
                  Placeholders are filled only with information on the candidate&apos;s record. Anything missing appears as{" "}
                  <code>[[MISSING: …]]</code> in the draft and must be edited before approval.{" "}
                  <code>{"{{community_line}}"}</code> is included only when an admin has confirmed a community link with evidence.
                </p>
                <p className="text-sm">
                  Available:{" "}
                  {[...PERSONAL_PLACEHOLDERS, ...LINK_PLACEHOLDERS].map((p) => (
                    <code key={p} className="mr-2 inline-block">{`{{${p}}}`}</code>
                  ))}
                </p>
                <label className="block text-sm">
                  <span className="font-semibold">Subject</span>
                  <input name="subjectTemplate" defaultValue={s.subjectTemplate} maxLength={300} required className="input mt-1" />
                </label>
                <label className="block text-sm">
                  <span className="font-semibold">Message</span>
                  <span className="block text-muted">Must include {"{{signup_link}}"} and {"{{unsubscribe_link}}"}.</span>
                  <textarea name="bodyTemplate" defaultValue={s.bodyTemplate} rows={18} maxLength={10000} required className="input mt-1 font-mono text-sm" />
                </label>
                <p className="text-xs text-muted">Changes apply to new drafts only. Existing drafts keep their text.</p>
              </section>

              <section className="card space-y-4">
                <h2 className="font-serif text-xl font-semibold text-brand-900">Sending</h2>
                {configured ? (
                  <Alert tone="info" title="A sending account is configured">Real sending is available. Switch it on below.</Alert>
                ) : (
                  <Alert tone="warning" title="No sending account configured">
                    {info.reasons.join(" ")} Real sending can&apos;t be switched on until this is fixed.
                  </Alert>
                )}
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" name="sendingEnabled" defaultChecked={s.sendingEnabled} disabled={!configured} className="mt-1 size-4 accent-brand-700" />
                  <span>
                    <span className="font-semibold">Allow real sending</span>
                    <span className="block text-muted">Off by default. Every message still needs individual approval.</span>
                  </span>
                </label>
                <label className="block max-w-xs text-sm">
                  <span className="font-semibold">Batch limit</span>
                  <span className="block text-muted">Messages per batch (1–50; the server also caps it at {info.maxBatch}).</span>
                  <input name="batchLimit" type="number" min={1} max={50} defaultValue={s.batchLimit} className="input mt-1" />
                </label>
              </section>
            </ActionForm>
          );
        }}
      </AdminOnly>
    </Suspense>
  );
}
