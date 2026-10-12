"use client";

import { setPausedAction } from "@/app/actions";
import { FormMessage, SubmitButton, useActionForm } from "@/components/forms";

export function PauseToggle({ paused }: { paused: boolean }) {
  const { state, formAction, pending, onSubmit } = useActionForm(setPausedAction);
  return (
    <div className="space-y-3">
      <form action={formAction} onSubmit={onSubmit} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="paused" value={paused ? "false" : "true"} />
        <SubmitButton pending={pending} className={paused ? "btn-primary" : "btn-secondary"} pendingLabel="Updating…">
          {paused ? "Resume availability" : "Pause new requests"}
        </SubmitButton>
      </form>
      <FormMessage state={state} />
    </div>
  );
}
