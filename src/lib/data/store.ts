import type { ServiceType } from "../domain/options";
import type {
  Account,
  EmailRecord,
  IntroRequest,
  OutreachMessage,
  OutreachSettings,
  OutreachStatus,
  Prospect,
  ProspectInput,
  ProspectPatch,
  ProviderProfile,
  ProviderProfileInput,
  RequestEvent,
  RequestStatus,
  ReviewStatus,
  StudentProfile,
  Suppression,
} from "../domain/types";

export type StudentProfileInput = Omit<StudentProfile, "userId" | "isDemo" | "createdAt" | "updatedAt">;

export type NewOutreachMessage = Pick<
  OutreachMessage,
  "prospectId" | "recipient" | "subject" | "body" | "inviteToken" | "unsubscribeToken" | "createdBy"
>;

export interface NewIntroRequest {
  studentId: string;
  providerId: string;
  service: ServiceType;
  message: string;
  matchScore: number;
  matchReasons: string[];
}

/**
 * Persistence boundary. Authorization decisions live in src/lib/services; the
 * Supabase implementation additionally runs every call with the signed-in
 * user's JWT so Row Level Security applies even if a service check is missed.
 */
export interface DataStore {
  readonly kind: "demo" | "supabase";

  getAccount(id: string): Promise<Account | null>;
  listAccounts(): Promise<Account[]>;
  updateAccount(id: string, patch: { fullName?: string; linkedinUrl?: string | null }): Promise<void>;

  getStudentProfile(userId: string): Promise<StudentProfile | null>;
  listStudentProfiles(): Promise<StudentProfile[]>;
  saveStudentProfile(userId: string, input: StudentProfileInput): Promise<StudentProfile>;

  getProviderProfile(userId: string): Promise<ProviderProfile | null>;
  listProviderProfiles(): Promise<ProviderProfile[]>;
  saveProviderProfile(userId: string, input: ProviderProfileInput): Promise<ProviderProfile>;
  setProviderPaused(userId: string, paused: boolean): Promise<void>;
  setProviderReview(userId: string, status: ReviewStatus, note: string | null, reviewerId: string): Promise<void>;

  getRequest(id: string): Promise<IntroRequest | null>;
  listRequests(filter?: { studentId?: string; providerId?: string }): Promise<IntroRequest[]>;
  createRequest(input: NewIntroRequest): Promise<IntroRequest>;
  transitionRequest(id: string, to: RequestStatus, actorId: string, note?: string | null): Promise<IntroRequest>;
  listRequestEvents(requestId: string): Promise<RequestEvent[]>;

  // ---- Recruitment (admin-only data; RLS enforces this in Supabase) ----
  listProspects(): Promise<Prospect[]>;
  getProspect(id: string): Promise<Prospect | null>;
  /** Inserts new candidates, skipping duplicates by email or by (source, sourceRef). */
  importProspects(rows: ProspectInput[], importedBy: string): Promise<{ inserted: number; duplicates: number }>;
  updateProspect(id: string, patch: ProspectPatch): Promise<Prospect>;

  getOutreachSettings(): Promise<OutreachSettings | null>;
  saveOutreachSettings(settings: Omit<OutreachSettings, "updatedAt">): Promise<void>;
  listOutreachMessages(filter?: { prospectId?: string }): Promise<OutreachMessage[]>;
  getOutreachMessage(id: string): Promise<OutreachMessage | null>;
  createOutreachMessage(input: NewOutreachMessage): Promise<OutreachMessage>;
  /**
   * Conditional update: applies `patch` only if the message's current status is
   * in `expect`. Returns null when it isn't — this is the atomic send claim.
   * At most one message per candidate may be "sending" or "sent" (conflict otherwise).
   */
  updateOutreachMessage(id: string, patch: Partial<OutreachMessage>, expect: OutreachStatus[]): Promise<OutreachMessage | null>;

  listSuppressions(): Promise<Suppression[]>;
  /** Idempotent per email address. */
  addSuppression(input: { email: string; reason: Suppression["reason"]; note: string | null; createdBy: string | null }): Promise<void>;
  removeSuppression(id: string): Promise<void>;
  isSuppressed(email: string): Promise<boolean>;

  /** Public, token-based operations (no admin session). */
  unsubscribeByToken(token: string): Promise<boolean>;
  /** Links the signed-in user to the invited candidate and marks them "joined". */
  claimInvitation(token: string, userId: string): Promise<boolean>;
  /** Email webhook: a sent message bounced or drew a complaint (needs elevated access in Supabase). */
  recordDeliveryFailure(providerMessageId: string, kind: "bounced" | "complaint", detail: string): Promise<boolean>;

  recordEmail(email: Omit<EmailRecord, "id" | "createdAt">): Promise<void>;
  listEmails(): Promise<EmailRecord[]>;
}
