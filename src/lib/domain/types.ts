import type {
  AvailabilitySlot,
  CareerArea,
  CommunityId,
  LanguageCode,
  MentoringGoal,
  Seeking,
  ServiceType,
  Subject,
  TeachingLevel,
} from "./options";

export type Role = "member" | "admin";
export type ReviewStatus = "pending" | "approved" | "rejected";
export type RequestStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "withdrawn"
  | "introduced"
  | "completed"
  | "cancelled";
/** Recruitment pipeline. Set by admins, except "invited" (on a real send) and "joined" (on signup). */
export type ProspectStatus = "new" | "invited" | "interested" | "declined" | "joined";

/** Private account record. Visible only to its owner and UIS admins. */
export interface Account {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  communityId: CommunityId;
  linkedinUrl: string | null;
  isDemo: boolean;
  createdAt: string;
}

export interface StudentProfile {
  userId: string;
  fullName: string;
  university: string;
  degree: string;
  degreeLevel: TeachingLevel;
  studyYear: number | null;
  preferredLanguage: LanguageCode;
  languages: LanguageCode[];
  timeZone: string;
  goals: MentoringGoal[];
  interests: string[];
  seeking: Seeking;
  subjects: Subject[];
  careerAreas: CareerArea[];
  availability: AvailabilitySlot[];
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Fields a mentor/tutor edits themselves. */
export interface ProviderProfileInput {
  fullName: string;
  headline: string;
  bio: string;
  expertise: string[];
  offersMentoring: boolean;
  offersTutoring: boolean;
  tutoringSubjects: Subject[];
  teachingLevels: TeachingLevel[];
  mentoringTopics: MentoringGoal[];
  careerAreas: CareerArea[];
  careerExperience: string;
  yearsExperience: number;
  languages: LanguageCode[];
  timeZone: string;
  availability: AvailabilitySlot[];
  maxActiveMentees: number;
  directoryConsent: boolean;
}

export interface ProviderProfile extends ProviderProfileInput {
  userId: string;
  isPaused: boolean;
  reviewStatus: ReviewStatus;
  reviewNote: string | null;
  /** Requests currently in an "accepted" or "introduced" state. */
  activeCount: number;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IntroRequest {
  id: string;
  studentId: string;
  providerId: string;
  service: ServiceType;
  message: string;
  status: RequestStatus;
  /** Snapshot of the match score when the request was made. */
  matchScore: number | null;
  /** Snapshot of the human-readable reasons when the request was made. */
  matchReasons: string[];
  createdAt: string;
  updatedAt: string;
  respondedAt: string | null;
  introducedAt: string | null;
  closedAt: string | null;
}

export interface RequestEvent {
  id: string;
  requestId: string;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  actorId: string | null;
  note: string | null;
  createdAt: string;
}

/** Where a candidate record came from. `apollo_mock` records are fictional and can never be emailed. */
export type ProspectSource = "csv" | "apollo" | "apollo_mock" | "manual" | "demo-seed";
/** Admin review before spending enrichment credits or contacting anyone. */
export type ProspectReview = "unreviewed" | "approved" | "rejected";
export type EmailStatus = "none" | "provided" | "verified" | "unverified" | "unavailable";
export type EnrichmentStatus = "not_requested" | "found_email" | "no_email" | "no_match" | "error";
/** Only "confirmed" (with written evidence) may be used in messages. Never inferred from a name. */
export type CommunityAffiliation = "unconfirmed" | "confirmed" | "not_affiliated";

/** An unconfirmed hint about community relevance, with where it came from. */
export interface CommunitySignal {
  kind: "location" | "organization" | "language" | "note";
  detail: string;
  source: string;
  recordedAt: string;
}

/**
 * A recruitment candidate. Never a registered user and never shown in the
 * directory: becoming a mentor requires signup, a profile, consent and review.
 */
export interface Prospect {
  id: string;
  fullName: string;
  email: string | null;
  organization: string | null;
  title: string | null;
  location: string | null;
  expertise: string | null;
  linkedinUrl: string | null;
  notes: string | null;
  source: ProspectSource;
  /** External id at the source (e.g. Apollo person id). */
  sourceRef: string | null;
  /** Human-readable provenance, e.g. the Apollo search filters used. */
  sourceDetail: string | null;
  /** When the data was retrieved from the source. */
  retrievedAt: string;
  status: ProspectStatus;
  reviewStatus: ProspectReview;
  reviewNote: string | null;
  emailStatus: EmailStatus;
  emailSource: "csv" | "apollo" | "apollo_mock" | "manual" | null;
  enrichmentStatus: EnrichmentStatus;
  enrichmentError: string | null;
  enrichedAt: string | null;
  communityAffiliation: CommunityAffiliation;
  affiliationEvidence: string | null;
  affiliationReviewedBy: string | null;
  affiliationReviewedAt: string | null;
  communitySignals: CommunitySignal[];
  doNotContact: boolean;
  /** Set when the candidate signs up through an invitation (or an admin links them). */
  joinedUserId: string | null;
  importedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ProspectInput = Pick<
  Prospect,
  "fullName" | "email" | "organization" | "expertise" | "linkedinUrl" | "notes"
> &
  Partial<Pick<Prospect, "title" | "location" | "source" | "sourceRef" | "sourceDetail" | "retrievedAt" | "emailStatus" | "emailSource" | "communitySignals">>;

/** Fields an admin (or the recruitment service) may change on a candidate. */
export type ProspectPatch = Partial<
  Omit<Prospect, "id" | "source" | "sourceRef" | "importedBy" | "createdAt" | "updatedAt">
>;

export type OutreachStatus =
  | "draft"
  | "approved"
  | "sending" // claimed by a send attempt; outcome unknown until recorded
  | "sent" // accepted by the real email provider
  | "failed" // provider rejected or errored (delivery failure, not a reply)
  | "bounced" // provider reported a bounce/complaint after sending
  | "mock_logged" // handled by the mock adapter: NOT delivered
  | "cancelled";

export interface OutreachMessage {
  id: string;
  prospectId: string;
  recipient: string | null;
  subject: string;
  /** Body with {{signup_link}} / {{unsubscribe_link}} kept as placeholders. */
  body: string;
  status: OutreachStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  approvedRecipient: string | null;
  approvedHash: string | null;
  inviteToken: string;
  unsubscribeToken: string;
  provider: "resend" | "mock" | null;
  providerMessageId: string | null;
  attemptCount: number;
  lastError: string | null;
  sentAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Suppression {
  id: string;
  email: string;
  reason: "unsubscribed" | "admin" | "bounced" | "complaint";
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface OutreachSettings {
  subjectTemplate: string;
  bodyTemplate: string;
  /** Max messages per "send batch" click (also capped by OUTREACH_MAX_BATCH). */
  batchLimit: number;
  /** Admin switch. Only effective when a real sending account is configured. */
  sendingEnabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export interface EmailRecord {
  id: string;
  to: string[];
  subject: string;
  body: string;
  delivery: "suppressed_demo" | "not_configured" | "sent" | "failed";
  createdAt: string;
}

/** The authenticated user as seen by the service layer. */
export interface Actor {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
}
