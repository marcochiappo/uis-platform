"use client";

import { useId } from "react";
import { requestIntroAction, transitionAction } from "@/app/actions";
import { FormMessage, SubmitButton, TextArea, useActionForm } from "@/components/forms";
import type { ServiceType } from "@/lib/domain/options";
import type { RequestStatus } from "@/lib/domain/types";

const LABELS: Partial<Record<RequestStatus, { label: string; pending: string; className: string }>> = {
  accepted: { label: "Accept", pending: "Accepting…", className: "btn-primary" },
  declined: { label: "Decline", pending: "Declining…", className: "btn-danger" },
  withdrawn: { label: "Withdraw request", pending: "Withdrawing…", className: "btn-secondary" },
  introduced: { label: "Confirm introduction", pending: "Confirming…", className: "btn-primary" },
  completed: { label: "Mark completed", pending: "Saving…", className: "btn-secondary" },
  cancelled: { label: "Cancel", pending: "Cancelling…", className: "btn-danger" },
};

/** One form per allowed transition; the server re-checks every one. */
export function TransitionButtons({
  requestId,
  allowed,
  confirmCopy = {},
}: {
  requestId: string;
  allowed: RequestStatus[];
  confirmCopy?: Partial<Record<RequestStatus, string>>;
}) {
  const { state, formAction, pending, onSubmit } = useActionForm(transitionAction);
  if (allowed.length === 0) return null;
  return (
    <div className="space-y-2">
      <FormMessage state={state} />
      {state.status !== "success" && (
        <form
          action={formAction}
          onSubmit={(e) => {
            const to = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") as RequestStatus | null;
            const question = to ? confirmCopy[to] : undefined;
            if (question && !window.confirm(question)) {
              e.preventDefault();
              return;
            }
            onSubmit(e);
          }}
          className="flex flex-wrap gap-2"
        >
          <input type="hidden" name="requestId" value={requestId} />
          {allowed.map((to) => {
            const l = LABELS[to];
            if (!l) return null;
            return (
              <button key={to} type="submit" name="to" value={to} className={l.className} disabled={pending}>
                {pending ? l.pending : l.label}
              </button>
            );
          })}
        </form>
      )}
    </div>
  );
}

export function RequestIntroForm({
  providerId,
  service,
  providerName,
}: {
  providerId: string;
  service: ServiceType;
  providerName: string;
}) {
  const { state, formAction, pending, onSubmit } = useActionForm(requestIntroAction);
  const id = useId();
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <details className="group rounded-xl border border-line bg-slate-50 open:bg-white" aria-describedby={`${id}-desc`}>
      <summary className="btn-accent w-full cursor-pointer list-none sm:w-auto [&::-webkit-details-marker]:hidden">
        Request an introduction
      </summary>
      <form action={formAction} onSubmit={onSubmit} className="space-y-3 p-4">
        <p id={`${id}-desc`} className="text-sm text-muted">
          {providerName} will see your name, studies, goals and interests, but not your email. If they accept, UIS introduces
          you both by email.
        </p>
        <FormMessage state={state} />
        <input type="hidden" name="providerId" value={providerId} />
        <input type="hidden" name="service" value={service} />
        <TextArea
          name="message"
          label="Message"
          rows={3}
          maxLength={1000}
          placeholder="A sentence or two about what you'd like help with."
          errors={state.fieldErrors?.message}
        />
        <SubmitButton pending={pending} pendingLabel="Sending…" className="btn-primary">
          Send request
        </SubmitButton>
      </form>
    </details>
  );
}
