import { DomainError } from "../domain/errors";
import { evaluate, findMatches, isAcceptingRequests, type MatchResult } from "../domain/matching";
import type { ServiceType } from "../domain/options";
import {
  allowedTransitions,
  assertTransition,
  isOpen,
  type Party,
} from "../domain/requests";
import type {
  Account,
  Actor,
  IntroRequest,
  ProviderProfile,
  RequestStatus,
  ReviewStatus,
  StudentProfile,
} from "../domain/types";
import type { ProviderProfileForm, StudentProfileForm } from "../domain/validation";
import { formatReason } from "../i18n";
import { requireActor, requireAdmin, type ServiceContext } from "./context";

export { requireActor, requireAdmin, type RecruitmentDeps, type ServiceContext } from "./context";
export * from "./recruitment";

function partiesFor(actor: Actor, r: IntroRequest): Party[] {
  const parties: Party[] = [];
  if (r.studentId === actor.userId) parties.push("student");
  if (r.providerId === actor.userId) parties.push("provider");
  if (actor.role === "admin") parties.push("admin");
  return parties;
}

/** What a mentor may see about a student who contacted them. No contact details. */
export type StudentSummary = Pick<
  StudentProfile,
  | "userId"
  | "fullName"
  | "university"
  | "degree"
  | "degreeLevel"
  | "studyYear"
  | "preferredLanguage"
  | "languages"
  | "timeZone"
  | "goals"
  | "interests"
  | "subjects"
  | "careerAreas"
  | "isDemo"
>;

export function toStudentSummary(s: StudentProfile): StudentSummary {
  const { userId, fullName, university, degree, degreeLevel, studyYear, preferredLanguage, languages, timeZone, goals, interests, subjects, careerAreas, isDemo } = s;
  return { userId, fullName, university, degree, degreeLevel, studyYear, preferredLanguage, languages, timeZone, goals, interests, subjects, careerAreas, isDemo };
}

// ---------------------------------------------------------------- profiles

export async function getMyProfiles(ctx: ServiceContext) {
  const actor = requireActor(ctx);
  const [account, student, provider] = await Promise.all([
    ctx.store.getAccount(actor.userId),
    ctx.store.getStudentProfile(actor.userId),
    ctx.store.getProviderProfile(actor.userId),
  ]);
  return { account, student, provider };
}

export async function saveStudentProfile(ctx: ServiceContext, form: StudentProfileForm) {
  const actor = requireActor(ctx);
  const profile = await ctx.store.saveStudentProfile(actor.userId, form);
  if (form.fullName !== actor.fullName) await ctx.store.updateAccount(actor.userId, { fullName: form.fullName });
  return profile;
}

export async function saveProviderProfile(ctx: ServiceContext, form: ProviderProfileForm) {
  const actor = requireActor(ctx);
  const { linkedinUrl, ...input } = form;
  const profile = await ctx.store.saveProviderProfile(actor.userId, input);
  await ctx.store.updateAccount(actor.userId, { linkedinUrl, fullName: form.fullName });
  return profile;
}

export async function setMyAvailabilityPaused(ctx: ServiceContext, paused: boolean) {
  const actor = requireActor(ctx);
  const profile = await ctx.store.getProviderProfile(actor.userId);
  if (!profile) throw new DomainError("not_found", "Create your mentor/tutor profile first.");
  await ctx.store.setProviderPaused(actor.userId, paused);
}

// ---------------------------------------------------------------- student

export interface RequestView {
  request: IntroRequest;
  /** Display name of the other party (or both, for admins). */
  providerName: string;
  providerHeadline: string;
  student: StudentSummary | null;
  allowed: RequestStatus[];
}

export interface StudentDashboard {
  student: StudentProfile;
  result: MatchResult;
  requests: RequestView[];
  /** `${providerId}:${service}` pairs with an open request. */
  openRequestKeys: string[];
}

export async function getStudentDashboard(ctx: ServiceContext): Promise<StudentDashboard | null> {
  const actor = requireActor(ctx);
  const student = await ctx.store.getStudentProfile(actor.userId);
  if (!student) return null;
  const [providers, requests] = await Promise.all([
    ctx.store.listProviderProfiles(),
    ctx.store.listRequests({ studentId: actor.userId }),
  ]);
  const byId = new Map(providers.map((p) => [p.userId, p]));
  const result = findMatches(student, providers, ctx.now?.());
  return {
    student,
    result,
    requests: requests.map((r) => ({
      request: r,
      providerName: byId.get(r.providerId)?.fullName ?? "Mentor no longer listed",
      providerHeadline: byId.get(r.providerId)?.headline ?? "",
      student: null,
      allowed: allowedTransitions(r.status, ["student"]),
    })),
    openRequestKeys: requests.filter((r) => isOpen(r.status)).map((r) => `${r.providerId}:${r.service}`),
  };
}

export async function requestIntroduction(
  ctx: ServiceContext,
  input: { providerId: string; service: ServiceType; message: string },
) {
  const actor = requireActor(ctx);
  const student = await ctx.store.getStudentProfile(actor.userId);
  if (!student) throw new DomainError("forbidden", "Complete your student profile before requesting an introduction.");
  if (input.providerId === actor.userId) throw new DomainError("validation", "You cannot request an introduction to yourself.");
  const provider = await ctx.store.getProviderProfile(input.providerId);
  if (!provider || !isAcceptingRequests(provider))
    throw new DomainError("invalid_state", "This mentor isn't accepting new requests right now.");
  // Recompute server-side: the client never decides whether a match is valid.
  const sought = student.seeking === "both" || student.seeking === input.service;
  const ev = sought ? evaluate(student, provider, input.service, ctx.now?.()) : null;
  if (!ev?.ok)
    throw new DomainError("validation", "This person doesn't meet the requirements for that service based on your profile.");
  return ctx.store.createRequest({
    studentId: actor.userId,
    providerId: provider.userId,
    service: input.service,
    message: input.message.trim(),
    matchScore: ev.match.score,
    matchReasons: ev.match.reasons.map((r) => formatReason(r)),
  });
}

// ---------------------------------------------------------------- transitions

export async function transitionRequest(
  ctx: ServiceContext,
  requestId: string,
  to: RequestStatus,
  note: string | null = null,
) {
  const actor = requireActor(ctx);
  const request = await ctx.store.getRequest(requestId);
  // Same error for "missing" and "not yours" so ids can't be probed.
  const parties = request ? partiesFor(actor, request) : [];
  if (!request || parties.length === 0) throw new DomainError("not_found", "Request not found.");
  assertTransition(request.status, to, parties);

  if (to === "accepted") {
    const provider = await ctx.store.getProviderProfile(request.providerId);
    if (!provider || provider.activeCount >= provider.maxActiveMentees)
      throw new DomainError("invalid_state", "You have reached your maximum number of active mentees. Increase it or complete a match first.");
  }

  const updated = await ctx.store.transitionRequest(requestId, to, actor.userId, note);
  if (to === "introduced") await sendIntroductionEmail(ctx, updated);
  return updated;
}

export const withdrawRequest = (ctx: ServiceContext, id: string) => transitionRequest(ctx, id, "withdrawn");
export const respondToRequest = (ctx: ServiceContext, id: string, accept: boolean) =>
  transitionRequest(ctx, id, accept ? "accepted" : "declined");

async function sendIntroductionEmail(ctx: ServiceContext, r: IntroRequest) {
  if (!ctx.mailer) return;
  const [student, provider] = await Promise.all([ctx.store.getAccount(r.studentId), ctx.store.getAccount(r.providerId)]);
  if (!student || !provider) return;
  await ctx.mailer({
    to: [student.email, provider.email],
    subject: `UIS introduction: ${student.fullName} and ${provider.fullName}`,
    body: [
      `Hello ${student.fullName} and ${provider.fullName},`,
      "",
      `UIS is happy to introduce you for ${r.service}. You have both agreed to connect, so you can now reply to this email to arrange your first conversation.`,
      "",
      "— The UIS team",
    ].join("\n"),
  });
}

// ---------------------------------------------------------------- mentor

export interface ProviderDashboard {
  provider: ProviderProfile;
  requests: RequestView[];
}

export async function getProviderDashboard(ctx: ServiceContext): Promise<ProviderDashboard | null> {
  const actor = requireActor(ctx);
  const provider = await ctx.store.getProviderProfile(actor.userId);
  if (!provider) return null;
  const requests = await ctx.store.listRequests({ providerId: actor.userId });
  const students = new Map(
    (await Promise.all([...new Set(requests.map((r) => r.studentId))].map((id) => ctx.store.getStudentProfile(id))))
      .filter((s): s is StudentProfile => s !== null)
      .map((s) => [s.userId, toStudentSummary(s)]),
  );
  return {
    provider,
    requests: requests.map((r) => ({
      request: r,
      providerName: provider.fullName,
      providerHeadline: provider.headline,
      student: students.get(r.studentId) ?? null,
      allowed: allowedTransitions(r.status, ["provider"]),
    })),
  };
}

// ---------------------------------------------------------------- admin

export interface AdminRequestView extends RequestView {
  studentAccount: Account | null;
  providerAccount: Account | null;
}

export async function adminListProviders(ctx: ServiceContext) {
  requireAdmin(ctx);
  const [providers, accounts] = await Promise.all([ctx.store.listProviderProfiles(), ctx.store.listAccounts()]);
  const acc = new Map(accounts.map((a) => [a.id, a]));
  const order: Record<ReviewStatus, number> = { pending: 0, rejected: 1, approved: 2 };
  return providers
    .map((provider) => ({ provider, account: acc.get(provider.userId) ?? null }))
    .sort((a, b) => order[a.provider.reviewStatus] - order[b.provider.reviewStatus] || a.provider.fullName.localeCompare(b.provider.fullName));
}

export async function adminListStudents(ctx: ServiceContext) {
  requireAdmin(ctx);
  const [students, accounts] = await Promise.all([ctx.store.listStudentProfiles(), ctx.store.listAccounts()]);
  const acc = new Map(accounts.map((a) => [a.id, a]));
  return students.map((student) => ({ student, account: acc.get(student.userId) ?? null }));
}

export async function reviewProvider(ctx: ServiceContext, userId: string, status: ReviewStatus, note: string | null) {
  const admin = requireAdmin(ctx);
  if (status === "pending") throw new DomainError("validation", "Choose approve or reject.");
  const provider = await ctx.store.getProviderProfile(userId);
  if (!provider) throw new DomainError("not_found", "Profile not found.");
  await ctx.store.setProviderReview(userId, status, note?.trim() || null, admin.userId);
}

export async function adminListRequests(ctx: ServiceContext): Promise<AdminRequestView[]> {
  requireAdmin(ctx);
  const [requests, providers, students, accounts] = await Promise.all([
    ctx.store.listRequests(),
    ctx.store.listProviderProfiles(),
    ctx.store.listStudentProfiles(),
    ctx.store.listAccounts(),
  ]);
  const p = new Map(providers.map((x) => [x.userId, x]));
  const s = new Map(students.map((x) => [x.userId, x]));
  const a = new Map(accounts.map((x) => [x.id, x]));
  return requests.map((r) => ({
    request: r,
    providerName: p.get(r.providerId)?.fullName ?? a.get(r.providerId)?.fullName ?? "Unknown",
    providerHeadline: p.get(r.providerId)?.headline ?? "",
    student: s.has(r.studentId) ? toStudentSummary(s.get(r.studentId)!) : null,
    studentAccount: a.get(r.studentId) ?? null,
    providerAccount: a.get(r.providerId) ?? null,
    allowed: allowedTransitions(r.status, ["admin"]),
  }));
}

export async function adminOverview(ctx: ServiceContext) {
  requireAdmin(ctx);
  const [providers, students, requests, prospects] = await Promise.all([
    ctx.store.listProviderProfiles(),
    ctx.store.listStudentProfiles(),
    ctx.store.listRequests(),
    ctx.store.listProspects(),
  ]);
  return {
    pendingReviews: providers.filter((p) => p.reviewStatus === "pending").length,
    listedProviders: providers.filter((p) => p.reviewStatus === "approved" && p.directoryConsent).length,
    students: students.length,
    pendingRequests: requests.filter((r) => r.status === "pending").length,
    awaitingIntroduction: requests.filter((r) => r.status === "accepted").length,
    activeMatches: requests.filter((r) => r.status === "introduced").length,
    prospects: prospects.length,
  };
}

export async function adminListEmails(ctx: ServiceContext) {
  requireAdmin(ctx);
  return ctx.store.listEmails();
}
