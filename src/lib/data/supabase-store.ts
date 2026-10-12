import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { DomainError } from "../domain/errors";
import { buildProspect, normalizeEmail } from "../domain/recruitment";
import type {
  Account,
  IntroRequest,
  OutreachMessage,
  OutreachStatus,
  Prospect,
  ProviderProfile,
  RequestEvent,
  StudentProfile,
  Suppression,
} from "../domain/types";
import type { DataStore } from "./store";

/* eslint-disable @typescript-eslint/no-explicit-any -- rows are mapped explicitly below */
type Row = Record<string, any>;

/**
 * Supabase-backed store. The client carries the signed-in user's session, so
 * every query is filtered by RLS; request changes go through SECURITY DEFINER
 * RPCs that re-validate permissions and state transitions in Postgres.
 */
export class SupabaseStore implements DataStore {
  readonly kind = "supabase" as const;
  constructor(private sb: SupabaseClient) {}

  private fail(error: PostgrestError | null, conflictMessage = "This record already exists."): void {
    if (!error) return;
    const map: Record<string, DomainError["code"]> = {
      "42501": "forbidden",
      "28000": "unauthenticated",
      P0002: "not_found",
      P0001: "invalid_state",
      "22023": "validation",
      "23505": "conflict",
      "23514": "validation",
    };
    const code = map[error.code] ?? null;
    if (code === "conflict") throw new DomainError("conflict", conflictMessage);
    if (code) throw new DomainError(code, error.message);
    console.error("[supabase]", error);
    throw new Error("Database error. Please try again.");
  }

  // ---------------------------------------------------------------- accounts

  async getAccount(id: string) {
    const { data, error } = await this.sb.from("profiles").select("*").eq("id", id).maybeSingle();
    this.fail(error);
    return data ? toAccount(data) : null;
  }
  async listAccounts() {
    const { data, error } = await this.sb.from("profiles").select("*").order("created_at");
    this.fail(error);
    return (data ?? []).map(toAccount);
  }
  async updateAccount(id: string, patch: { fullName?: string; linkedinUrl?: string | null }) {
    const row: Row = {};
    if (patch.fullName !== undefined) row.full_name = patch.fullName;
    if (patch.linkedinUrl !== undefined) row.linkedin_url = patch.linkedinUrl;
    const { error } = await this.sb.from("profiles").update(row).eq("id", id);
    this.fail(error);
  }

  // ---------------------------------------------------------------- students

  async getStudentProfile(userId: string) {
    const { data, error } = await this.sb.from("student_profiles").select("*").eq("user_id", userId).maybeSingle();
    this.fail(error);
    return data ? toStudent(data) : null;
  }
  async listStudentProfiles() {
    const { data, error } = await this.sb.from("student_profiles").select("*").order("full_name");
    this.fail(error);
    return (data ?? []).map(toStudent);
  }
  async saveStudentProfile(userId: string, s: Parameters<DataStore["saveStudentProfile"]>[1]) {
    const { data, error } = await this.sb
      .from("student_profiles")
      .upsert({
        user_id: userId,
        full_name: s.fullName,
        university: s.university,
        degree: s.degree,
        degree_level: s.degreeLevel,
        study_year: s.studyYear,
        preferred_language: s.preferredLanguage,
        languages: s.languages,
        time_zone: s.timeZone,
        goals: s.goals,
        interests: s.interests,
        seeking: s.seeking,
        subjects: s.subjects,
        career_areas: s.careerAreas,
        availability: s.availability,
      })
      .select()
      .single();
    this.fail(error);
    return toStudent(data!);
  }

  // ---------------------------------------------------------------- providers

  async getProviderProfile(userId: string) {
    const { data, error } = await this.sb.from("provider_profiles").select("*").eq("user_id", userId).maybeSingle();
    this.fail(error);
    return data ? toProvider(data) : null;
  }
  async listProviderProfiles() {
    const { data, error } = await this.sb.from("provider_profiles").select("*").order("full_name");
    this.fail(error);
    return (data ?? []).map(toProvider);
  }
  async saveProviderProfile(userId: string, p: Parameters<DataStore["saveProviderProfile"]>[1]) {
    // Review status, capacity counters and demo flags are set by DB triggers.
    const { data, error } = await this.sb
      .from("provider_profiles")
      .upsert({
        user_id: userId,
        full_name: p.fullName,
        headline: p.headline,
        bio: p.bio,
        expertise: p.expertise,
        offers_mentoring: p.offersMentoring,
        offers_tutoring: p.offersTutoring,
        tutoring_subjects: p.tutoringSubjects,
        teaching_levels: p.teachingLevels,
        mentoring_topics: p.mentoringTopics,
        career_areas: p.careerAreas,
        career_experience: p.careerExperience,
        years_experience: p.yearsExperience,
        languages: p.languages,
        time_zone: p.timeZone,
        availability: p.availability,
        max_active_mentees: p.maxActiveMentees,
        directory_consent: p.directoryConsent,
      })
      .select()
      .single();
    this.fail(error);
    return toProvider(data!);
  }
  async setProviderPaused(userId: string, paused: boolean) {
    const { error } = await this.sb.from("provider_profiles").update({ is_paused: paused }).eq("user_id", userId);
    this.fail(error);
  }
  async setProviderReview(userId: string, status: ProviderProfile["reviewStatus"], note: string | null) {
    const { data, error } = await this.sb
      .from("provider_profiles")
      .update({ review_status: status, review_note: note })
      .eq("user_id", userId)
      .select("review_status")
      .single();
    this.fail(error);
    if (data?.review_status !== status) throw new DomainError("forbidden", "Review could not be saved.");
  }

  // ---------------------------------------------------------------- requests

  async getRequest(id: string) {
    const { data, error } = await this.sb.from("intro_requests").select("*").eq("id", id).maybeSingle();
    this.fail(error);
    return data ? toRequest(data) : null;
  }
  async listRequests(filter: { studentId?: string; providerId?: string } = {}) {
    let q = this.sb.from("intro_requests").select("*").order("created_at", { ascending: false });
    if (filter.studentId) q = q.eq("student_id", filter.studentId);
    if (filter.providerId) q = q.eq("provider_id", filter.providerId);
    const { data, error } = await q;
    this.fail(error);
    return (data ?? []).map(toRequest);
  }
  async createRequest(input: Parameters<DataStore["createRequest"]>[0]) {
    const { data, error } = await this.sb
      .rpc("create_intro_request", {
        p_provider: input.providerId,
        p_service: input.service,
        p_message: input.message,
        p_score: input.matchScore,
        p_reasons: input.matchReasons,
      })
      .single();
    this.fail(error, "You already have an open request with this person for this service.");
    return toRequest(data as Row);
  }
  async transitionRequest(id: string, to: IntroRequest["status"], _actorId: string, note: string | null = null) {
    const { data, error } = await this.sb
      .rpc("transition_request", { p_request: id, p_to: to, p_note: note })
      .single();
    this.fail(error);
    return toRequest(data as Row);
  }
  async listRequestEvents(requestId: string) {
    const { data, error } = await this.sb
      .from("request_events")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at");
    this.fail(error);
    return (data ?? []).map(
      (e): RequestEvent => ({
        id: String(e.id),
        requestId: e.request_id,
        fromStatus: e.from_status,
        toStatus: e.to_status,
        actorId: e.actor_id,
        note: e.note,
        createdAt: e.created_at,
      }),
    );
  }

  // ---------------------------------------------------------------- recruitment (admin-only via RLS)

  async listProspects() {
    const { data, error } = await this.sb.from("prospects").select("*").order("created_at", { ascending: false });
    this.fail(error);
    return (data ?? []).map(toProspect);
  }
  async getProspect(id: string) {
    const { data, error } = await this.sb.from("prospects").select("*").eq("id", id).maybeSingle();
    this.fail(error);
    return data ? toProspect(data) : null;
  }
  async importProspects(rows: Parameters<DataStore["importProspects"]>[0], importedBy: string) {
    const existing = await this.listProspects();
    const emails = new Set(existing.map((p) => p.email).filter(Boolean));
    const refs = new Set(existing.filter((p) => p.sourceRef).map((p) => `${p.source}:${p.sourceRef}`));
    const fresh: Row[] = [];
    for (const r of rows) {
      const p = buildProspect("", r, importedBy, new Date().toISOString());
      const ref = p.sourceRef ? `${p.source}:${p.sourceRef}` : null;
      if ((p.email && emails.has(p.email)) || (ref && refs.has(ref))) continue;
      if (p.email) emails.add(p.email);
      if (ref) refs.add(ref);
      // id and timestamps come from database defaults.
      fresh.push(prospectRow({ ...p, id: undefined, createdAt: undefined, updatedAt: undefined }));
    }
    if (fresh.length) {
      const { error } = await this.sb.from("prospects").insert(fresh);
      this.fail(error, "Some candidates already exist.");
    }
    return { inserted: fresh.length, duplicates: rows.length - fresh.length };
  }
  async updateProspect(id: string, patch: Parameters<DataStore["updateProspect"]>[1]) {
    const { data, error } = await this.sb.from("prospects").update(prospectRow(patch)).eq("id", id).select().single();
    this.fail(error, "Another candidate already has this email address.");
    return toProspect(data!);
  }

  async getOutreachSettings() {
    const { data, error } = await this.sb.from("outreach_settings").select("*").eq("id", 1).maybeSingle();
    this.fail(error);
    if (!data) return null;
    return {
      subjectTemplate: data.subject_template,
      bodyTemplate: data.body_template,
      batchLimit: data.batch_limit,
      sendingEnabled: data.sending_enabled,
      updatedAt: data.updated_at,
      updatedBy: data.updated_by,
    };
  }
  async saveOutreachSettings(s: Parameters<DataStore["saveOutreachSettings"]>[0]) {
    const { error } = await this.sb.from("outreach_settings").upsert({
      id: 1,
      subject_template: s.subjectTemplate,
      body_template: s.bodyTemplate,
      batch_limit: s.batchLimit,
      sending_enabled: s.sendingEnabled,
      updated_by: s.updatedBy,
      updated_at: new Date().toISOString(),
    });
    this.fail(error);
  }
  async listOutreachMessages(filter: { prospectId?: string } = {}) {
    let q = this.sb.from("outreach_messages").select("*").order("created_at", { ascending: false });
    if (filter.prospectId) q = q.eq("prospect_id", filter.prospectId);
    const { data, error } = await q;
    this.fail(error);
    return (data ?? []).map(toOutreach);
  }
  async getOutreachMessage(id: string) {
    const { data, error } = await this.sb.from("outreach_messages").select("*").eq("id", id).maybeSingle();
    this.fail(error);
    return data ? toOutreach(data) : null;
  }
  async createOutreachMessage(m: Parameters<DataStore["createOutreachMessage"]>[0]) {
    const { data, error } = await this.sb
      .from("outreach_messages")
      .insert({
        prospect_id: m.prospectId,
        recipient: m.recipient,
        subject: m.subject,
        body: m.body,
        invite_token: m.inviteToken,
        unsubscribe_token: m.unsubscribeToken,
        created_by: m.createdBy,
      })
      .select()
      .single();
    this.fail(error);
    return toOutreach(data!);
  }
  async updateOutreachMessage(id: string, patch: Partial<OutreachMessage>, expect: OutreachStatus[]) {
    const map: Record<string, string> = {
      recipient: "recipient", subject: "subject", body: "body", status: "status", approvedBy: "approved_by",
      approvedAt: "approved_at", approvedRecipient: "approved_recipient", approvedHash: "approved_hash",
      provider: "provider", providerMessageId: "provider_message_id", attemptCount: "attempt_count",
      lastError: "last_error", sentAt: "sent_at",
    };
    const row: Row = {};
    for (const [k, v] of Object.entries(patch)) if (map[k]) row[map[k]] = v;
    // Single conditional UPDATE … WHERE status IN (…): atomic, so only one caller can claim a send.
    const { data, error } = await this.sb.from("outreach_messages").update(row).eq("id", id).in("status", expect).select().maybeSingle();
    this.fail(error, "This candidate already has an invitation being sent or sent.");
    return data ? toOutreach(data) : null;
  }

  async listSuppressions() {
    const { data, error } = await this.sb.from("suppressions").select("*").order("created_at", { ascending: false });
    this.fail(error);
    return (data ?? []).map(
      (r): Suppression => ({ id: r.id, email: r.email, reason: r.reason, note: r.note, createdBy: r.created_by, createdAt: r.created_at }),
    );
  }
  async addSuppression(input: Parameters<DataStore["addSuppression"]>[0]) {
    const { error } = await this.sb
      .from("suppressions")
      .upsert({ email: normalizeEmail(input.email), reason: input.reason, note: input.note, created_by: input.createdBy }, { onConflict: "email", ignoreDuplicates: true });
    this.fail(error);
  }
  async removeSuppression(id: string) {
    const { error } = await this.sb.from("suppressions").delete().eq("id", id);
    this.fail(error);
  }
  async isSuppressed(email: string) {
    const { data, error } = await this.sb.from("suppressions").select("id").eq("email", normalizeEmail(email)).maybeSingle();
    this.fail(error);
    return Boolean(data);
  }
  async unsubscribeByToken(token: string) {
    const { data, error } = await this.sb.rpc("unsubscribe_by_token", { p_token: token });
    this.fail(error);
    return data === true;
  }
  async claimInvitation(token: string) {
    const { data, error } = await this.sb.rpc("claim_invitation", { p_token: token });
    this.fail(error);
    return data === true;
  }
  /** Requires a service-role client (webhook only). */
  async recordDeliveryFailure(providerMessageId: string, kind: "bounced" | "complaint", detail: string) {
    const { data, error } = await this.sb.rpc("record_delivery_failure", { p_provider_message_id: providerMessageId, p_kind: kind, p_detail: detail });
    this.fail(error);
    return data === true;
  }

  // Email history is only kept in demo mode.
  async recordEmail() {}
  async listEmails() {
    return [];
  }
}

function toAccount(r: Row): Account {
  return {
    id: r.id,
    email: r.email,
    fullName: r.full_name,
    role: r.role,
    communityId: r.community_id,
    linkedinUrl: r.linkedin_url,
    isDemo: r.is_demo,
    createdAt: r.created_at,
  };
}

function toStudent(r: Row): StudentProfile {
  return {
    userId: r.user_id,
    fullName: r.full_name,
    university: r.university,
    degree: r.degree,
    degreeLevel: r.degree_level,
    studyYear: r.study_year,
    preferredLanguage: r.preferred_language,
    languages: r.languages,
    timeZone: r.time_zone,
    goals: r.goals,
    interests: r.interests,
    seeking: r.seeking,
    subjects: r.subjects,
    careerAreas: r.career_areas,
    availability: r.availability,
    isDemo: r.is_demo,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toProvider(r: Row): ProviderProfile {
  return {
    userId: r.user_id,
    fullName: r.full_name,
    headline: r.headline,
    bio: r.bio,
    expertise: r.expertise,
    offersMentoring: r.offers_mentoring,
    offersTutoring: r.offers_tutoring,
    tutoringSubjects: r.tutoring_subjects,
    teachingLevels: r.teaching_levels,
    mentoringTopics: r.mentoring_topics,
    careerAreas: r.career_areas,
    careerExperience: r.career_experience,
    yearsExperience: r.years_experience,
    languages: r.languages,
    timeZone: r.time_zone,
    availability: r.availability,
    maxActiveMentees: r.max_active_mentees,
    directoryConsent: r.directory_consent,
    isPaused: r.is_paused,
    reviewStatus: r.review_status,
    reviewNote: r.review_note,
    activeCount: r.active_count,
    isDemo: r.is_demo,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toRequest(r: Row): IntroRequest {
  return {
    id: r.id,
    studentId: r.student_id,
    providerId: r.provider_id,
    service: r.service,
    message: r.message,
    status: r.status,
    matchScore: r.match_score,
    matchReasons: r.match_reasons,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    respondedAt: r.responded_at,
    introducedAt: r.introduced_at,
    closedAt: r.closed_at,
  };
}

function toProspect(r: Row): Prospect {
  return {
    id: r.id,
    fullName: r.full_name,
    email: r.email,
    organization: r.organization,
    title: r.title,
    location: r.location,
    expertise: r.expertise,
    linkedinUrl: r.linkedin_url,
    notes: r.notes,
    source: r.source,
    sourceRef: r.source_ref,
    sourceDetail: r.source_detail,
    retrievedAt: r.retrieved_at,
    status: r.status,
    reviewStatus: r.review_status,
    reviewNote: r.review_note,
    emailStatus: r.email_status,
    emailSource: r.email_source,
    enrichmentStatus: r.enrichment_status,
    enrichmentError: r.enrichment_error,
    enrichedAt: r.enriched_at,
    communityAffiliation: r.community_affiliation,
    affiliationEvidence: r.affiliation_evidence,
    affiliationReviewedBy: r.affiliation_reviewed_by,
    affiliationReviewedAt: r.affiliation_reviewed_at,
    communitySignals: r.community_signals ?? [],
    doNotContact: r.do_not_contact,
    joinedUserId: r.joined_user_id,
    importedBy: r.imported_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const PROSPECT_COLUMNS: Record<string, string> = {
  fullName: "full_name", email: "email", organization: "organization", title: "title", location: "location",
  expertise: "expertise", linkedinUrl: "linkedin_url", notes: "notes", source: "source", sourceRef: "source_ref",
  sourceDetail: "source_detail", retrievedAt: "retrieved_at", status: "status", reviewStatus: "review_status",
  reviewNote: "review_note", emailStatus: "email_status", emailSource: "email_source", enrichmentStatus: "enrichment_status",
  enrichmentError: "enrichment_error", enrichedAt: "enriched_at", communityAffiliation: "community_affiliation",
  affiliationEvidence: "affiliation_evidence", affiliationReviewedBy: "affiliation_reviewed_by",
  affiliationReviewedAt: "affiliation_reviewed_at", communitySignals: "community_signals", doNotContact: "do_not_contact",
  joinedUserId: "joined_user_id", importedBy: "imported_by",
};

function prospectRow(p: Partial<Prospect>): Row {
  const row: Row = {};
  for (const [k, v] of Object.entries(p)) if (PROSPECT_COLUMNS[k] && v !== undefined) row[PROSPECT_COLUMNS[k]] = v;
  return row;
}

function toOutreach(r: Row): OutreachMessage {
  return {
    id: r.id,
    prospectId: r.prospect_id,
    recipient: r.recipient,
    subject: r.subject,
    body: r.body,
    status: r.status,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    approvedRecipient: r.approved_recipient,
    approvedHash: r.approved_hash,
    inviteToken: r.invite_token,
    unsubscribeToken: r.unsubscribe_token,
    provider: r.provider,
    providerMessageId: r.provider_message_id,
    attemptCount: r.attempt_count,
    lastError: r.last_error,
    sentAt: r.sent_at,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
