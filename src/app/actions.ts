"use server";

import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { DEMO_COOKIE, encodeDemoSession } from "@/lib/auth/demo-session";
import { claimPendingInvite, rememberInvite } from "@/lib/auth/invite";
import { isDemoMode } from "@/lib/config";
import { DomainError, isDomainError } from "@/lib/domain/errors";
import {
  fieldErrors,
  formToObject,
  introRequestSchema,
  loginSchema,
  providerProfileSchema,
  signupSchema,
  studentProfileSchema,
} from "@/lib/domain/validation";
import type { ActionState } from "@/lib/action-state";
import { getContext, getDemoStore } from "@/lib/server";
import * as svc from "@/lib/services";
import { createClient } from "@/lib/supabase/server";

async function run(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e); // let redirect()/notFound() through
    if (isDomainError(e)) return { status: "error", message: e.message };
    console.error(e);
    return { status: "error", message: "Something went wrong. Please try again." };
  }
}

const invalid = (error: z.ZodError): ActionState => ({
  status: "error",
  message: "Please correct the highlighted fields.",
  fieldErrors: fieldErrors(error),
});

async function setDemoCookie(userId: string) {
  (await cookies()).set(DEMO_COOKIE, encodeDemoSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

// ------------------------------------------------------------------ auth

export async function demoSignIn(formData: FormData) {
  if (!isDemoMode()) throw new DomainError("forbidden", "Demo sign-in is disabled.");
  const userId = String(formData.get("userId") ?? "");
  const account = await getDemoStore().getAccount(userId);
  if (!account) redirect("/login?error=unknown");
  await setDemoCookie(account.id);
  if (await claimPendingInvite()) redirect("/onboarding?invited=1");
  redirect(await homePath(account.id, account.role === "admin"));
}

/** Final destination after sign-in (avoids chaining redirects through /dashboard). */
async function homePath(userId: string, admin: boolean) {
  if (admin) return "/admin/overview";
  const store = getDemoStore();
  if (await store.getStudentProfile(userId)) return "/student";
  if (await store.getProviderProfile(userId)) return "/mentor";
  return "/onboarding";
}

export async function signUp(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    // Only these three fields are read. Any "role" sent by a client is ignored.
    const parsed = signupSchema.safeParse({
      fullName: formData.get("fullName"),
      email: formData.get("email"),
      password: isDemoMode() ? "demo-mode-no-password" : formData.get("password"),
    });
    if (!parsed.success) return invalid(parsed.error);
    const { fullName, email, password } = parsed.data;
    await rememberInvite(String(formData.get("invite") ?? ""));

    if (isDemoMode()) {
      const account = await getDemoStore().createAccount({ fullName, email });
      await setDemoCookie(account.id);
      redirect((await claimPendingInvite()) ? "/onboarding?invited=1" : "/onboarding");
    }

    const sb = await createClient();
    const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: `${origin}/auth/confirm?next=/onboarding` },
    });
    if (error) return { status: "error", message: error.message };
    if (data.session) redirect((await claimPendingInvite()) ? "/onboarding?invited=1" : "/onboarding");
    return {
      status: "success",
      message: "Check your inbox to confirm your email address, then sign in.",
    };
  });
}

export async function signIn(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    if (isDemoMode()) throw new DomainError("forbidden", "Use the demo accounts below.");
    const parsed = loginSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return invalid(parsed.error);
    const sb = await createClient();
    const { error } = await sb.auth.signInWithPassword(parsed.data);
    if (error) return { status: "error", message: "Incorrect email or password, or email not yet confirmed." };
    redirect((await claimPendingInvite()) ? "/onboarding?invited=1" : "/dashboard");
  });
}

export async function signOut() {
  if (isDemoMode()) (await cookies()).delete(DEMO_COOKIE);
  else await (await createClient()).auth.signOut();
  redirect("/");
}

// ------------------------------------------------------------------ profiles

export async function saveStudentProfileAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const parsed = studentProfileSchema.safeParse(
      formToObject(formData, ["languages", "goals", "subjects", "careerAreas", "availability"]),
    );
    if (!parsed.success) return invalid(parsed.error);
    await svc.saveStudentProfile(await getContext(), parsed.data);
    redirect("/student?saved=1");
  });
}

export async function saveProviderProfileAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const parsed = providerProfileSchema.safeParse(
      formToObject(
        formData,
        ["tutoringSubjects", "teachingLevels", "mentoringTopics", "careerAreas", "languages", "availability"],
        ["offersMentoring", "offersTutoring", "directoryConsent"],
      ),
    );
    if (!parsed.success) return invalid(parsed.error);
    await svc.saveProviderProfile(await getContext(), parsed.data);
    redirect("/mentor?saved=1");
  });
}

export async function setPausedAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const paused = formData.get("paused") === "true";
    await svc.setMyAvailabilityPaused(await getContext(), paused);
    refresh();
    return {
      status: "success",
      message: paused
        ? "You're paused. Students won't see you in their matches."
        : "You're visible to matching students again.",
    };
  });
}

// ------------------------------------------------------------------ requests

export async function requestIntroAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const parsed = introRequestSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return invalid(parsed.error);
    await svc.requestIntroduction(await getContext(), parsed.data);
    refresh();
    return { status: "success", message: "Request sent. We'll show the mentor's reply here." };
  });
}

const transitionSchema = z.object({
  requestId: z.string().min(1),
  to: z.enum(["accepted", "declined", "withdrawn", "introduced", "completed", "cancelled"]),
  note: z.string().trim().max(500).optional(),
});

const TRANSITION_MESSAGES: Record<z.infer<typeof transitionSchema>["to"], string> = {
  accepted: "Accepted. UIS will confirm and send the introduction.",
  declined: "Request declined. The student has been told it wasn't a fit.",
  withdrawn: "Request withdrawn.",
  introduced: "Introduction confirmed. This is now an active match.",
  completed: "Match marked as completed.",
  cancelled: "Request cancelled.",
};

export async function transitionAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const parsed = transitionSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { status: "error", message: "Invalid request." };
    const { requestId, to, note } = parsed.data;
    await svc.transitionRequest(await getContext(), requestId, to, note || null);
    refresh();
    return { status: "success", message: TRANSITION_MESSAGES[to] };
  });
}

// ------------------------------------------------------------------ admin

const reviewSchema = z.object({
  userId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).optional(),
});

export async function reviewProviderAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const parsed = reviewSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { status: "error", message: "Invalid review." };
    await svc.reviewProvider(await getContext(), parsed.data.userId, parsed.data.decision, parsed.data.note ?? null);
    refresh();
    return {
      status: "success",
      message: parsed.data.decision === "approved" ? "Profile approved." : "Profile marked as not approved.",
    };
  });
}

const MAX_CSV_BYTES = 1024 * 1024;

export async function importProspectsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Choose a CSV file to upload." };
    if (file.size > MAX_CSV_BYTES) return { status: "error", message: "The file is larger than 1 MB." };
    const result = await svc.importProspectsCsv(await getContext(), await file.text());
    refresh();
    const parts = [`${result.inserted} prospect${result.inserted === 1 ? "" : "s"} imported`];
    if (result.duplicates) parts.push(`${result.duplicates} already on file`);
    if (result.errors.length) parts.push(`${result.errors.length} row${result.errors.length === 1 ? "" : "s"} skipped`);
    return {
      status: result.inserted > 0 || result.errors.length === 0 ? "success" : "error",
      message: `${parts.join(", ")}.`,
      data: result,
    };
  });
}

export async function resetDemoAction(): Promise<ActionState> {
  return run(async () => {
    if (!isDemoMode()) throw new DomainError("forbidden", "Only available in demo mode.");
    svc.requireAdmin(await getContext());
    await getDemoStore().reset();
    refresh();
    return { status: "success", message: "Demo data restored to the original fictional dataset." };
  });
}
