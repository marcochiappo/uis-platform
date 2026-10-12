"use client";

import type { ReactNode } from "react";
import { FormMessage, SubmitButton, useActionForm } from "@/components/forms";
import type { ActionState } from "@/lib/action-state";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

interface ReportRow {
  name?: string;
  candidate?: string;
  outcome?: string;
  detail?: string;
}

/**
 * A small form bound to a server action, with pending/success/error states and
 * an optional per-item report (enrichment and send batches return one).
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Working…",
  buttonClass = "btn-primary",
  className = "space-y-3",
  confirm,
  disabled,
  hidden,
}: {
  action: Action;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  buttonClass?: string;
  className?: string;
  /** Native confirm() prompt before submitting. */
  confirm?: string;
  disabled?: boolean;
  hidden?: Record<string, string>;
}) {
  const { state, formAction, pending, onSubmit } = useActionForm(action);
  const rows = (state.data as { results?: ReportRow[] } | undefined)?.results;
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) {
          e.preventDefault();
          return;
        }
        onSubmit(e);
      }}
      className={className}
    >
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      <div className="flex flex-wrap items-center gap-3">
        {disabled ? (
          <button type="button" className={buttonClass} disabled aria-disabled="true">
            {submitLabel}
          </button>
        ) : (
          <SubmitButton pending={pending} pendingLabel={pendingLabel} className={buttonClass}>
            {submitLabel}
          </SubmitButton>
        )}
      </div>
      <FormMessage state={state} />
      {rows && rows.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-white text-sm">
          {rows.map((r, i) => (
            <li key={i} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:justify-between">
              <span className="font-medium">{r.name ?? r.candidate}</span>
              <span className="text-muted">{r.outcome && r.detail ? `${r.outcome}: ${r.detail}` : (r.outcome ?? r.detail)}</span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
