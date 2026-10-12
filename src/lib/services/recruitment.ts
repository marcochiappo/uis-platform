import { createHash, randomBytes } from "node:crypto";
import type { DataStore } from "../data/store";
import { DomainError } from "../domain/errors";
import { DEFAULT_COMMUNITY } from "../domain/options";
import { parseProspectCsv, type ProspectRowError } from "../domain/prospects-csv";
import {
  approvalProblems,
  canSetProspectStatus,
  communitySignals,
  DEFAULT_BODY_TEMPLATE,
  DEFAULT_SUBJECT_TEMPLATE,
  finalizeMessage,
  isObfuscated,
  isValidEmail,
  normalizeEmail,
  renderTemplate,
} from "../domain/recruitment";
import type {
  CommunityAffiliation,
  OutreachMessage,
  OutreachSettings,
  Prospect,
  ProspectInput,
  ProspectReview,
  ProspectStatus,
} from "../domain/types";
import { ApolloError, type ApolloSearchParams, type ApolloSearchPerson } from "../recruitment/apollo";
import { sendingStatus, type SendingStatus } from "../recruitment/sender";
import { requireActor, requireAdmin, type RecruitmentDeps, type ServiceContext } from "./context";

/**
 * Admin-only mentor recruitment. Every exported function (except the public
 * token handlers at the bottom) starts with requireAdmin().
 *
 * Invariants:
 *  - Nothing is sent without an admin approving the exact recipient + text.
 *  - At most one invitation per candidate reaches "sending"/"sent" (store + DB index).
 *  - Retries reuse the message id as the provider idempotency key.
 *  - Suppressed / do-not-contact recipients are re-checked immediately before sending.
 *  - Mock adapters never produce a "sent" status.
 *  - Inviting or joining never creates a mentor profile, an approval or a match.
 */

const COMMUNITY_NAME: Record<string, string> = { italian: "Italian community" };
const MAX_ENRICH_PER_CALL = 10;

function deps(ctx: ServiceContext): RecruitmentDeps {
  if (!ctx.recruitment) throw new Error("Recruitment dependencies are not configured.");
  return ctx.recruitment;
}
const nowIso = (ctx: ServiceContext) => (ctx.now?.() ?? new Date()).toISOString();
const newToken = (ctx: ServiceContext) => ctx.recruitment?.token?.() ?? randomBytes(24).toString("base64url");

export function approvalHash(recipient: string, subject: string, body: string): string {
  return createHash("sha256").update(`${normalizeEmail(recipient)}\n${subject}\n${body}`).digest("hex");
}

async function mustGetProspect(store: DataStore, id: string): Promise<Prospect> {
  const p = await store.getProspect(id);
  if (!p) throw new DomainError("not_found", "Candidate not found.");
  return p;
}

// ------------------------------------------------------------------ candidates

export async function listCandidates(ctx: ServiceContext) {
  requireAdmin(ctx);
  const [candidates, messages] = await Promise.all([ctx.store.listProspects(), ctx.store.listOutreachMessages()]);
  const latest = new Map<string, OutreachMessage>();
  for (const m of messages) if (!latest.has(m.prospectId)) latest.set(m.prospectId, m);
  return candidates.map((prospect) => ({ prospect, latestMessage: latest.get(prospect.id) ?? null }));
}

export async function getCandidate(ctx: ServiceContext, id: string) {
  requireAdmin(ctx);
  const prospect = await mustGetProspect(ctx.store, id);
  const [messages, suppressed, account, provider] = await Promise.all([
    ctx.store.listOutreachMessages({ prospectId: id }),
    prospect.email ? ctx.store.isSuppressed(prospect.email) : Promise.resolve(false),
    prospect.joinedUserId ? ctx.store.getAccount(prospect.joinedUserId) : Promise.resolve(null),
    prospect.joinedUserId ? ctx.store.getProviderProfile(prospect.joinedUserId) : Promise.resolve(null),
  ]);
  return { prospect, messages, suppressed, account, provider };
}

/** Back-compat alias used by the admin overview. */
export const adminListProspects = async (ctx: ServiceContext) => {
  requireAdmin(ctx);
  return ctx.store.listProspects();
};

export interface ProspectImportResult {
  inserted: number;
  duplicates: number;
  errors: ProspectRowError[];
}

export async function importProspectsCsv(ctx: ServiceContext, csv: string): Promise<ProspectImportResult> {
  const admin = requireAdmin(ctx);
  const { rows, errors } = parseProspectCsv(csv);
  if (rows.length === 0) return { inserted: 0, duplicates: 0, errors };
  const at = nowIso(ctx);
  const inputs: ProspectInput[] = rows.map(({ communityNote, ...r }) => ({
    ...r,
    source: "csv",
    sourceDetail: "Manually selected contacts (CSV upload)",
    retrievedAt: at,
    communitySignals: communitySignals(DEFAULT_COMMUNITY, { location: r.location, organization: r.organization, note: communityNote }, "CSV import", at),
  }));
  const res = await ctx.store.importProspects(inputs, admin.userId);
  return { ...res, errors };
}

export async function reviewCandidate(ctx: ServiceContext, id: string, decision: ProspectReview, note: string | null) {
  requireAdmin(ctx);
  if (decision === "unreviewed") throw new DomainError("validation", "Choose approve or reject.");
  await mustGetProspect(ctx.store, id);
  return ctx.store.updateProspect(id, { reviewStatus: decision, reviewNote: note?.trim() || null });
}

export async function updateCandidateDetails(
  ctx: ServiceContext,
  id: string,
  input: { fullName?: string; email?: string | null; title?: string | null; organization?: string | null; expertise?: string | null },
) {
  requireAdmin(ctx);
  const p = await mustGetProspect(ctx.store, id);
  const patch: Partial<Prospect> = {};
  for (const k of ["fullName", "title", "organization", "expertise"] as const) {
    const v = input[k];
    if (v !== undefined) (patch as Record<string, unknown>)[k] = typeof v === "string" ? v.trim() || null : v;
  }
  if (patch.fullName === null) throw new DomainError("validation", "Name can't be empty.");
  if (input.email !== undefined) {
    const email = input.email?.trim() ? normalizeEmail(input.email) : null;
    if (email && !isValidEmail(email)) throw new DomainError("validation", "Enter a valid email address.");
    if (email !== p.email) {
      patch.email = email;
      patch.emailSource = email ? "manual" : null;
      patch.emailStatus = email ? "provided" : "none";
    }
  }
  return ctx.store.updateProspect(id, patch);
}

export async function setCandidateStatus(ctx: ServiceContext, id: string, status: ProspectStatus) {
  requireAdmin(ctx);
  const p = await mustGetProspect(ctx.store, id);
  const problem = canSetProspectStatus(p, status);
  if (problem) throw new DomainError("validation", problem);
  return ctx.store.updateProspect(id, { status });
}

/** Back-compat name used by older UI. */
export const setProspectStatus = setCandidateStatus;

export async function setAffiliation(ctx: ServiceContext, id: string, affiliation: CommunityAffiliation, evidence: string | null) {
  const admin = requireAdmin(ctx);
  await mustGetProspect(ctx.store, id);
  const text = evidence?.trim() || null;
  if (affiliation === "confirmed" && (!text || text.length < 10))
    throw new DomainError("validation", "Describe the supporting information (at least 10 characters) before confirming a community link.");
  return ctx.store.updateProspect(id, {
    communityAffiliation: affiliation,
    affiliationEvidence: affiliation === "unconfirmed" ? null : text,
    affiliationReviewedBy: affiliation === "unconfirmed" ? null : admin.userId,
    affiliationReviewedAt: affiliation === "unconfirmed" ? null : nowIso(ctx),
  });
}

export async function addSignalNote(ctx: ServiceContext, id: string, note: string) {
  const admin = requireAdmin(ctx);
  const p = await mustGetProspect(ctx.store, id);
  if (!note.trim()) throw new DomainError("validation", "Write a note first.");
  return ctx.store.updateProspect(id, {
    communitySignals: [...p.communitySignals, { kind: "note", detail: note.trim().slice(0, 300), source: `Admin note (${admin.fullName})`, recordedAt: nowIso(ctx) }],
  });
}

export async function setDoNotContact(ctx: ServiceContext, id: string, on: boolean, note: string | null) {
  const admin = requireAdmin(ctx);
  const p = await mustGetProspect(ctx.store, id);
  if (on && p.email) await ctx.store.addSuppression({ email: p.email, reason: "admin", note: note?.trim() || "Marked do-not-contact by admin", createdBy: admin.userId });
  if (on) for (const m of await ctx.store.listOutreachMessages({ prospectId: id })) await ctx.store.updateOutreachMessage(m.id, { status: "cancelled", lastError: "Candidate marked do-not-contact." }, ["draft", "approved"]);
  return ctx.store.updateProspect(id, { doNotContact: on });
}

/** Link a candidate to an existing UIS account with the same email. Doesn't create or approve anything. */
export async function linkCandidateAccount(ctx: ServiceContext, id: string) {
  requireAdmin(ctx);
  const p = await mustGetProspect(ctx.store, id);
  if (!p.email) throw new DomainError("validation", "The candidate has no email to match against.");
  const account = (await ctx.store.listAccounts()).find((a) => normalizeEmail(a.email) === p.email);
  if (!account) throw new DomainError("not_found", "No UIS account uses this email yet. The candidate needs to sign up first.");
  return ctx.store.updateProspect(id, { joinedUserId: account.id, status: "joined" });
}

// ------------------------------------------------------------------ Apollo

export function apolloMode(ctx: ServiceContext) {
  requireAdmin(ctx);
  const a = deps(ctx).apollo;
  return a.mode === "unconfigured" ? { mode: a.mode, reason: a.reason } : { mode: a.mode, reason: null };
}

export type ApolloOutcome<T> = { ok: true; value: T } | { ok: false; kind: ApolloError["kind"]; message: string };

function apolloFailure(e: unknown): { ok: false; kind: ApolloError["kind"]; message: string } {
  if (e instanceof ApolloError) return { ok: false, kind: e.kind, message: e.message };
  console.error("[apollo]", e);
  return { ok: false, kind: "unavailable", message: "Unexpected error talking to Apollo." };
}

export async function searchApollo(ctx: ServiceContext, params: ApolloSearchParams) {
  requireAdmin(ctx);
  const a = deps(ctx).apollo;
  if (a.mode === "unconfigured") return { ok: false as const, kind: "missing_credentials" as const, message: a.reason };
  if (!params.keywords && !params.titles?.length && !params.organizationDomains?.length && !params.locations?.length)
    return { ok: false as const, kind: "invalid_request" as const, message: "Add at least one filter (expertise, role, organization or location)." };
  try {
    const result = await a.source.search(params);
    const source = a.mode === "mock" ? "apollo_mock" : "apollo";
    const saved = new Set((await ctx.store.listProspects()).filter((p) => p.source === source).map((p) => p.sourceRef));
    return { ok: true as const, value: { ...result, mode: a.mode, savedIds: result.people.filter((x) => saved.has(x.id)).map((x) => x.id) } };
  } catch (e) {
    return apolloFailure(e);
  }
}

/** Save admin-selected search results. The source label is decided server-side from the adapter mode. */
export async function saveApolloCandidates(ctx: ServiceContext, people: ApolloSearchPerson[], criteria: ApolloSearchParams) {
  const admin = requireAdmin(ctx);
  const a = deps(ctx).apollo;
  if (a.mode === "unconfigured") throw new DomainError("invalid_state", a.reason);
  if (people.length === 0) throw new DomainError("validation", "Select at least one person to save.");
  if (people.length > 100) throw new DomainError("validation", "Save at most 100 people at a time.");
  const at = nowIso(ctx);
  const detail = describeCriteria(criteria);
  const location = criteria.locations?.join("; ") || null;
  const rows: ProspectInput[] = people.map((x) => ({
    fullName: x.displayName.slice(0, 120),
    email: null,
    organization: x.organization?.slice(0, 160) ?? null,
    title: x.title?.slice(0, 200) ?? null,
    location: null,
    expertise: criteria.keywords?.slice(0, 300) ?? null,
    linkedinUrl: null,
    notes: x.hasEmail ? "Apollo reports an email on file (enrichment needed)." : "Apollo reports no email on file.",
    source: a.mode === "mock" ? "apollo_mock" : "apollo",
    sourceRef: x.id.slice(0, 100),
    sourceDetail: `Apollo people search: ${detail}`.slice(0, 500),
    retrievedAt: at,
    // Matching a location filter is a signal about where they are, not who they are.
    communitySignals: communitySignals(DEFAULT_COMMUNITY, { location: location ? `matched Apollo location filter "${location}"` : null }, a.mode === "mock" ? "Apollo search (MOCK)" : "Apollo search", at),
  }));
  return ctx.store.importProspects(rows, admin.userId);
}

function describeCriteria(c: ApolloSearchParams): string {
  return [
    c.keywords && `keywords "${c.keywords}"`,
    c.titles?.length && `titles ${c.titles.join(", ")}`,
    c.organizationDomains?.length && `organizations ${c.organizationDomains.join(", ")}`,
    c.locations?.length && `locations ${c.locations.join(", ")}`,
  ]
    .filter(Boolean)
    .join("; ");
}

export interface EnrichReport {
  results: { id: string; name: string; outcome: string }[];
  /** Set when Apollo stopped the batch (credits, rate limit, auth…). */
  stopped: { kind: ApolloError["kind"]; message: string } | null;
}

const APOLLO_EMAIL_STATUS: Record<string, Prospect["emailStatus"]> = { verified: "verified" };

/** Spend enrichment credits on admin-approved candidates only. Never re-enriches. */
export async function enrichCandidates(ctx: ServiceContext, ids: string[]): Promise<EnrichReport> {
  requireAdmin(ctx);
  const a = deps(ctx).apollo;
  if (a.mode === "unconfigured") return { results: [], stopped: { kind: "missing_credentials", message: a.reason } };
  const unique = [...new Set(ids)];
  if (unique.length === 0) throw new DomainError("validation", "Select at least one candidate.");
  if (unique.length > MAX_ENRICH_PER_CALL) throw new DomainError("validation", `Enrich at most ${MAX_ENRICH_PER_CALL} candidates at a time.`);
  const report: EnrichReport = { results: [], stopped: null };

  for (const id of unique) {
    const p = await mustGetProspect(ctx.store, id);
    const skip =
      p.reviewStatus !== "approved" ? "Skipped: approve the candidate in review first (no credits spent)."
      : p.doNotContact ? "Skipped: candidate is on the do-not-contact list."
      : p.enrichedAt ? "Skipped: already enriched (no credits spent)."
      : p.email ? "Skipped: an email is already on file."
      : a.mode === "live" && p.source === "apollo_mock" ? "Skipped: mock record."
      : a.mode === "mock" && p.source !== "apollo_mock" ? "Skipped: the mock adapter only enriches mock records."
      : null;
    if (skip) {
      report.results.push({ id, name: p.fullName, outcome: skip });
      continue;
    }
    if (report.stopped) {
      report.results.push({ id, name: p.fullName, outcome: "Not attempted: Apollo stopped the batch." });
      continue;
    }
    try {
      const e = await a.source.enrich({ apolloId: p.source.startsWith("apollo") ? p.sourceRef : null, fullName: p.fullName, organization: p.organization, linkedinUrl: p.linkedinUrl });
      const at = nowIso(ctx);
      const status: Prospect["enrichmentStatus"] = e.matchConfidence === "none" || (!e.email && !e.fullName) ? "no_match" : e.email ? "found_email" : "no_email";
      const label = a.mode === "mock" ? "Apollo enrichment (MOCK)" : "Apollo enrichment";
      await ctx.store.updateProspect(id, {
        enrichmentStatus: status,
        enrichmentError: null,
        enrichedAt: at,
        email: e.email ? normalizeEmail(e.email) : null,
        emailStatus: e.email ? (APOLLO_EMAIL_STATUS[e.emailStatus ?? ""] ?? "unverified") : "unavailable",
        emailSource: e.email ? (a.mode === "mock" ? "apollo_mock" : "apollo") : null,
        fullName: e.fullName && isObfuscated(p.fullName) ? e.fullName : p.fullName,
        title: p.title ?? e.title,
        organization: p.organization ?? e.organization,
        location: p.location ?? e.location,
        linkedinUrl: p.linkedinUrl ?? e.linkedinUrl,
        retrievedAt: at,
        communitySignals: [...p.communitySignals, ...communitySignals(DEFAULT_COMMUNITY, { location: e.location }, label, at)],
      });
      report.results.push({
        id,
        name: e.fullName ?? p.fullName,
        outcome: status === "found_email" ? `Email found (${e.emailStatus ?? "status unknown"}).` : status === "no_email" ? "Matched, but no email is available." : "No confident match.",
      });
    } catch (err) {
      const f = apolloFailure(err);
      await ctx.store.updateProspect(id, { enrichmentStatus: "error", enrichmentError: f.message });
      report.results.push({ id, name: p.fullName, outcome: `Failed: ${f.message}` });
      if (["credits_exhausted", "rate_limited", "unauthorized", "forbidden"].includes(f.kind)) report.stopped = { kind: f.kind, message: f.message };
    }
  }
  return report;
}

// ------------------------------------------------------------------ outreach settings

export function defaultOutreachSettings(): OutreachSettings {
  return { subjectTemplate: DEFAULT_SUBJECT_TEMPLATE, bodyTemplate: DEFAULT_BODY_TEMPLATE, batchLimit: 10, sendingEnabled: false, updatedAt: new Date(0).toISOString(), updatedBy: null };
}

export async function getOutreachSettings(ctx: ServiceContext): Promise<OutreachSettings> {
  requireAdmin(ctx);
  return (await ctx.store.getOutreachSettings()) ?? defaultOutreachSettings();
}

async function currentSending(ctx: ServiceContext): Promise<SendingStatus> {
  const settings = (await ctx.store.getOutreachSettings()) ?? defaultOutreachSettings();
  const d = deps(ctx);
  return sendingStatus(d.env, d.demo, settings.sendingEnabled, d.fetchImpl);
}

export async function getSendingInfo(ctx: ServiceContext) {
  requireAdmin(ctx);
  const settings = await getOutreachSettings(ctx);
  const s = await currentSending(ctx);
  return { live: s.live, reasons: s.reasons, mode: s.sender.kind, batchLimit: Math.min(settings.batchLimit, s.maxBatch), maxBatch: s.maxBatch };
}

export async function saveOutreachSettings(
  ctx: ServiceContext,
  input: { subjectTemplate: string; bodyTemplate: string; batchLimit: number; sendingEnabled: boolean },
) {
  const admin = requireAdmin(ctx);
  if (!input.bodyTemplate.includes("{{signup_link}}") || !input.bodyTemplate.includes("{{unsubscribe_link}}"))
    throw new DomainError("validation", "The template must include {{signup_link}} and {{unsubscribe_link}}.");
  if (!input.subjectTemplate.trim()) throw new DomainError("validation", "The subject can't be empty.");
  const d = deps(ctx);
  if (input.sendingEnabled) {
    const s = sendingStatus(d.env, d.demo, true);
    if (!s.live) throw new DomainError("invalid_state", `Sending can't be turned on yet: ${s.reasons.join(" ")}`);
  }
  await ctx.store.saveOutreachSettings({
    subjectTemplate: input.subjectTemplate.trim(),
    bodyTemplate: input.bodyTemplate,
    batchLimit: Math.max(1, Math.min(50, Math.floor(input.batchLimit))),
    sendingEnabled: input.sendingEnabled,
    updatedBy: admin.userId,
  });
}

// ------------------------------------------------------------------ drafts & approval

export async function createDraft(ctx: ServiceContext, prospectId: string) {
  const admin = requireAdmin(ctx);
  const p = await mustGetProspect(ctx.store, prospectId);
  if (!p.email) throw new DomainError("invalid_state", "Add or retrieve an email address before drafting an invitation.");
  if (p.doNotContact || (await ctx.store.isSuppressed(p.email))) throw new DomainError("invalid_state", "This person is on the do-not-contact list.");
  const existing = await ctx.store.listOutreachMessages({ prospectId });
  if (existing.some((m) => m.status === "sent" || m.status === "sending"))
    throw new DomainError("conflict", "This candidate has already been sent an invitation.");
  if (existing.some((m) => m.status === "draft" || m.status === "approved"))
    throw new DomainError("conflict", "This candidate already has an open draft. Edit that one instead.");
  const settings = (await ctx.store.getOutreachSettings()) ?? defaultOutreachSettings();
  const rc = { adminName: admin.fullName.replace(/\s*\(.*\)\s*$/, ""), communityName: COMMUNITY_NAME[DEFAULT_COMMUNITY] };
  const subject = renderTemplate(settings.subjectTemplate, p, rc);
  const body = renderTemplate(settings.bodyTemplate, p, rc);
  const message = await ctx.store.createOutreachMessage({
    prospectId,
    recipient: p.email,
    subject: subject.text,
    body: body.text,
    inviteToken: newToken(ctx),
    unsubscribeToken: newToken(ctx),
    createdBy: admin.userId,
  });
  return { message, missing: [...new Set([...subject.missing, ...body.missing])] };
}

export async function updateDraft(ctx: ServiceContext, id: string, input: { subject: string; body: string }) {
  requireAdmin(ctx);
  const m = await ctx.store.getOutreachMessage(id);
  if (!m) throw new DomainError("not_found", "Message not found.");
  const p = await mustGetProspect(ctx.store, m.prospectId);
  if (input.subject.length > 300 || input.body.length > 10_000) throw new DomainError("validation", "The message is too long.");
  // Any edit revokes approval: the admin must approve the final text again.
  const updated = await ctx.store.updateOutreachMessage(
    id,
    { subject: input.subject, body: input.body, recipient: p.email, status: "draft", approvedBy: null, approvedAt: null, approvedRecipient: null, approvedHash: null },
    ["draft", "approved"],
  );
  if (!updated) throw new DomainError("invalid_state", "Only drafts and approved (unsent) messages can be edited.");
  return updated;
}

export async function approveDraft(ctx: ServiceContext, id: string) {
  const admin = requireAdmin(ctx);
  const m = await ctx.store.getOutreachMessage(id);
  if (!m) throw new DomainError("not_found", "Message not found.");
  const p = await mustGetProspect(ctx.store, m.prospectId);
  const suppressed = m.recipient ? await ctx.store.isSuppressed(m.recipient) : false;
  const { live } = await currentSending(ctx);
  const problems = approvalProblems({ message: m, prospect: p, suppressed, live });
  if (problems.length) throw new DomainError("validation", `Can't approve yet: ${problems.join(" ")}`);
  const others = await ctx.store.listOutreachMessages({ prospectId: m.prospectId });
  if (others.some((x) => x.id !== id && (x.status === "sent" || x.status === "sending")))
    throw new DomainError("conflict", "This candidate has already been sent an invitation.");
  const updated = await ctx.store.updateOutreachMessage(
    id,
    { status: "approved", approvedBy: admin.userId, approvedAt: nowIso(ctx), approvedRecipient: m.recipient, approvedHash: approvalHash(m.recipient!, m.subject, m.body), lastError: null },
    ["draft"],
  );
  if (!updated) throw new DomainError("invalid_state", "Only drafts can be approved.");
  return updated;
}

export async function cancelMessage(ctx: ServiceContext, id: string) {
  requireAdmin(ctx);
  const updated = await ctx.store.updateOutreachMessage(id, { status: "cancelled" }, ["draft", "approved", "failed"]);
  if (!updated) throw new DomainError("invalid_state", "Only unsent messages can be cancelled.");
  return updated;
}

// ------------------------------------------------------------------ sending

export interface SendResult {
  id: string;
  candidate: string;
  outcome: "sent" | "failed" | "mock_logged" | "skipped" | "unknown";
  detail: string;
}

/**
 * Re-validate and send one approved (or previously failed) message.
 * Safe to call concurrently or repeatedly: the conditional claim lets exactly
 * one caller proceed, and the provider receives the same idempotency key on retry.
 */
async function sendOne(ctx: ServiceContext, sending: SendingStatus, id: string, from: ("approved" | "failed")[]): Promise<SendResult> {
  const m = await ctx.store.getOutreachMessage(id);
  if (!m) return { id, candidate: "?", outcome: "skipped", detail: "Message not found." };
  const p = await ctx.store.getProspect(m.prospectId);
  if (!p) return { id, candidate: "?", outcome: "skipped", detail: "Candidate not found." };
  const candidate = p.fullName;
  if (!(from as string[]).includes(m.status)) return { id, candidate, outcome: "skipped", detail: `Message is ${m.status}.` };

  const suppressed = m.recipient ? await ctx.store.isSuppressed(m.recipient) : false;
  const problems = approvalProblems({ message: m, prospect: p, suppressed, live: sending.live });
  if (suppressed || p.doNotContact) {
    await ctx.store.updateOutreachMessage(id, { status: "cancelled", lastError: "Recipient is on the do-not-contact list." }, from);
    return { id, candidate, outcome: "skipped", detail: "Recipient is on the do-not-contact list; message cancelled." };
  }
  const hashOk = m.approvedHash && m.recipient && m.approvedRecipient === m.recipient && approvalHash(m.recipient, m.subject, m.body) === m.approvedHash;
  if (problems.length || !hashOk) {
    await ctx.store.updateOutreachMessage(id, { status: "draft", approvedBy: null, approvedAt: null, approvedRecipient: null, approvedHash: null, lastError: `Approval revoked: ${problems.join(" ") || "content changed after approval."}` }, from);
    return { id, candidate, outcome: "skipped", detail: "Approval no longer valid; returned to drafts." };
  }

  let claimed: OutreachMessage | null;
  try {
    claimed = await ctx.store.updateOutreachMessage(id, { status: "sending", attemptCount: m.attemptCount + 1, provider: sending.sender.kind, lastError: null }, from);
  } catch (e) {
    if (e instanceof DomainError && e.code === "conflict") return { id, candidate, outcome: "skipped", detail: "Another invitation to this candidate is already sending or sent." };
    throw e;
  }
  if (!claimed) return { id, candidate, outcome: "skipped", detail: "Already being sent by another request." };

  const final = finalizeMessage(sending.siteUrl, m);
  let result;
  try {
    result = await sending.sender.send({ idempotencyKey: `uis-invite-${m.id}`, to: m.recipient!, subject: final.subject, body: final.body, unsubscribeUrl: final.unsubscribeUrl });
  } catch (e) {
    console.error("[outreach] send threw", e);
    // Outcome unknown: leave in "sending" so it is NOT retried automatically.
    return { id, candidate, outcome: "unknown", detail: "Outcome unknown. Check the provider dashboard, then mark it failed to allow a retry." };
  }

  if (result.outcome === "sent") {
    await ctx.store.updateOutreachMessage(id, { status: "sent", providerMessageId: result.providerMessageId, sentAt: nowIso(ctx) }, ["sending"]);
    if (p.status === "new") await ctx.store.updateProspect(p.id, { status: "invited" });
    return { id, candidate, outcome: "sent", detail: "Accepted by the email provider." };
  }
  if (result.outcome === "failed") {
    await ctx.store.updateOutreachMessage(id, { status: "failed", lastError: result.error }, ["sending"]);
    return { id, candidate, outcome: "failed", detail: result.error };
  }
  await ctx.store.updateOutreachMessage(id, { status: "mock_logged", lastError: result.note }, ["sending"]);
  return { id, candidate, outcome: "mock_logged", detail: result.note };
}

export async function sendApprovedBatch(ctx: ServiceContext) {
  requireAdmin(ctx);
  const sending = await currentSending(ctx);
  const settings = (await ctx.store.getOutreachSettings()) ?? defaultOutreachSettings();
  const limit = Math.min(settings.batchLimit, sending.maxBatch);
  const approved = (await ctx.store.listOutreachMessages())
    .filter((m) => m.status === "approved")
    .sort((a, b) => (a.approvedAt ?? "").localeCompare(b.approvedAt ?? ""))
    .slice(0, limit);
  const results: SendResult[] = [];
  for (const m of approved) results.push(await sendOne(ctx, sending, m.id, ["approved"]));
  return { live: sending.live, reasons: sending.reasons, limit, results };
}

export async function retryFailedMessage(ctx: ServiceContext, id: string) {
  requireAdmin(ctx);
  return sendOne(ctx, await currentSending(ctx), id, ["failed"]);
}

/** After checking the provider dashboard, release a message stuck in "sending" so it may be retried. */
export async function markSendingFailed(ctx: ServiceContext, id: string, note: string) {
  requireAdmin(ctx);
  const updated = await ctx.store.updateOutreachMessage(id, { status: "failed", lastError: `Marked failed by admin: ${note.trim() || "no note"}` }, ["sending"]);
  if (!updated) throw new DomainError("invalid_state", "Only messages stuck in 'sending' can be marked failed.");
  return updated;
}

// ------------------------------------------------------------------ do-not-contact

export async function listSuppressions(ctx: ServiceContext) {
  requireAdmin(ctx);
  return ctx.store.listSuppressions();
}

export async function addSuppression(ctx: ServiceContext, email: string, note: string | null) {
  const admin = requireAdmin(ctx);
  if (!isValidEmail(email.trim())) throw new DomainError("validation", "Enter a valid email address.");
  const normalized = normalizeEmail(email);
  await ctx.store.addSuppression({ email: normalized, reason: "admin", note: note?.trim() || null, createdBy: admin.userId });
  for (const p of (await ctx.store.listProspects()).filter((x) => x.email === normalized)) {
    await ctx.store.updateProspect(p.id, { doNotContact: true });
    for (const m of await ctx.store.listOutreachMessages({ prospectId: p.id }))
      await ctx.store.updateOutreachMessage(m.id, { status: "cancelled", lastError: "Added to do-not-contact list." }, ["draft", "approved"]);
  }
}

export async function removeSuppression(ctx: ServiceContext, id: string) {
  requireAdmin(ctx);
  await ctx.store.removeSuppression(id);
}

// ------------------------------------------------------------------ public token handlers

/** Anyone holding the link may unsubscribe; reveals nothing about the recipient. */
export async function unsubscribe(store: DataStore, token: string): Promise<boolean> {
  if (!token || token.length < 24 || token.length > 200) return false;
  return store.unsubscribeByToken(token);
}

/**
 * Called after an invited person signs up. Links the account to the candidate
 * record and marks it "joined". It does NOT create a mentor profile, approve
 * anything, or create any match: listing still requires profile + consent + review.
 */
export async function claimInvitation(ctx: ServiceContext, token: string): Promise<boolean> {
  const actor = requireActor(ctx);
  if (!token || token.length < 24 || token.length > 200) return false;
  return ctx.store.claimInvitation(token, actor.userId);
}
