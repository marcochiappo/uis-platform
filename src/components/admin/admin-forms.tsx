"use client";

import { useId } from "react";
import { importProspectsAction, resetDemoAction, reviewProviderAction } from "@/app/actions";
import { setProspectStatusAction } from "@/app/recruitment-actions";
import { FormMessage, SubmitButton, useActionForm } from "@/components/forms";
import type { ProspectStatus } from "@/lib/domain/types";
import type { ProspectImportResult } from "@/lib/services";
import { getMessages } from "@/lib/i18n";

const m = getMessages();

export function ReviewForm({ userId, current }: { userId: string; current: string }) {
  const { state, formAction, pending, onSubmit } = useActionForm(reviewProviderAction);
  const id = useId();
  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <div>
        <label htmlFor={`${id}-note`} className="block text-sm font-semibold">
          Note to the mentor <span className="font-normal text-muted">(optional, shown if not approved)</span>
        </label>
        <textarea id={`${id}-note`} name="note" rows={2} maxLength={500} className="input mt-1" />
      </div>
      <div className="flex flex-wrap gap-2">
        {current !== "approved" && (
          <button type="submit" name="decision" value="approved" className="btn-primary" disabled={pending}>
            Approve
          </button>
        )}
        {current !== "rejected" && (
          <button type="submit" name="decision" value="rejected" className="btn-danger" disabled={pending}>
            {current === "approved" ? "Revoke approval" : "Don't approve"}
          </button>
        )}
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function ProspectImportForm() {
  const { state, formAction, pending, onSubmit } = useActionForm(importProspectsAction);
  const id = useId();
  const report = state.data as ProspectImportResult | undefined;
  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor={id} className="block text-sm font-semibold">
          CSV file
        </label>
        <p id={`${id}-hint`} className="mt-1 text-sm text-muted">
          Columns: <code>full_name</code> (required), <code>email</code>, <code>organization</code>, <code>title</code>,{" "}
          <code>location</code>, <code>expertise</code>, <code>linkedin_url</code>, <code>notes</code>, <code>community_note</code>. Up to 1,000
          rows / 1 MB. Duplicate emails are skipped.
        </p>
        <input id={id} name="file" type="file" accept=".csv,text/csv" required aria-describedby={`${id}-hint`} className="input mt-2 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:font-semibold file:text-brand-800" />
      </div>
      <SubmitButton pending={pending} pendingLabel="Importing…">
        Import prospects
      </SubmitButton>
      <FormMessage state={state} />
      {report && report.errors.length > 0 && (
        <details className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" open>
          <summary className="cursor-pointer font-semibold">Skipped rows ({report.errors.length})</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {report.errors.slice(0, 50).map((e, i) => (
              <li key={i}>
                Line {e.line}: {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </form>
  );
}

export function ProspectStatusSelect({ id, status }: { id: string; status: ProspectStatus }) {
  const { state, formAction, pending, onSubmit } = useActionForm(setProspectStatusAction);
  const selectId = useId();
  return (
    <form action={formAction} onSubmit={onSubmit} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <label htmlFor={selectId} className="sr-only">
        Prospect status
      </label>
      <select
        id={selectId}
        name="status"
        defaultValue={status}
        className="input py-1 text-sm"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        disabled={pending}
      >
        {(Object.keys(m.prospectStatus) as ProspectStatus[]).map((s) => (
          <option key={s} value={s}>
            {m.prospectStatus[s]}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="btn-secondary">
          Save
        </button>
      </noscript>
      <span aria-live="polite" className="text-xs text-muted">
        {pending ? "Saving…" : state.status === "success" ? "Saved" : state.status === "error" ? state.message : ""}
      </span>
    </form>
  );
}

export function ResetDemoButton() {
  const { state, formAction, pending, onSubmit } = useActionForm(resetDemoAction);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("Restore all demo data to the original fictional dataset? Changes made in this demo will be lost.")) {
          e.preventDefault();
          return;
        }
        onSubmit(e);
      }}
      className="space-y-3"
    >
      <SubmitButton pending={pending} className="btn-secondary" pendingLabel="Resetting…">
        Reset demo data
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
