"use client";

import Link from "next/link";
import { signIn, signUp } from "@/app/actions";
import { FormMessage, SubmitButton, TextField, useActionForm } from "@/components/forms";

export function SignInForm() {
  const { state, formAction, pending, onSubmit } = useActionForm(signIn);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <TextField name="email" type="email" label="Email" autoComplete="email" required errors={fe.email} />
      <TextField name="password" type="password" label="Password" autoComplete="current-password" required errors={fe.password} />
      <SubmitButton pending={pending} pendingLabel="Signing in…" className="btn-primary w-full">
        Sign in
      </SubmitButton>
      <p className="text-center text-sm text-muted">
        New to UIS?{" "}
        <Link href="/signup" className="link">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function SignUpForm({ demo, invite }: { demo: boolean; invite?: string }) {
  const { state, formAction, pending, onSubmit } = useActionForm(signUp);
  const fe = state.fieldErrors ?? {};
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-4" noValidate>
      {invite && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900" role="note">
          <p className="font-semibold">You&apos;ve been invited to mentor with UIS</p>
          <p className="mt-1">
            After signing up, you can complete a mentor profile. UIS reviews every profile before students can see it, and
            nothing is shared until you agree.
          </p>
          <input type="hidden" name="invite" value={invite} />
        </div>
      )}
      <FormMessage state={state} />
      <TextField name="fullName" label="Full name" autoComplete="name" required errors={fe.fullName} />
      <TextField
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        errors={fe.email}
        hint={demo ? "Demo mode: nothing is sent to this address." : "Only UIS staff can see your email."}
      />
      {!demo && (
        <TextField
          name="password"
          type="password"
          label="Password"
          autoComplete="new-password"
          required
          minLength={10}
          hint="At least 10 characters."
          errors={fe.password}
        />
      )}
      <SubmitButton pending={pending} pendingLabel="Creating account…" className="btn-primary w-full">
        Create account
      </SubmitButton>
      <p className="text-xs text-muted">
        Every new account starts as a member. You can then set up a profile to look for support, to offer it, or both.
      </p>
    </form>
  );
}
