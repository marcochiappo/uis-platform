"use client";

import { unsubscribeAction } from "@/app/unsubscribe/actions";
import { FormMessage, SubmitButton, useActionForm } from "@/components/forms";

export function UnsubscribeForm({ token }: { token: string }) {
  const { state, formAction, pending, onSubmit } = useActionForm(unsubscribeAction);
  if (!token) return <p className="text-sm text-red-800">This link is incomplete. Please use the full link from the email.</p>;
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Unsubscribing…">
        Unsubscribe
      </SubmitButton>
    </form>
  );
}
