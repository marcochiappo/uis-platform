import type { CommunitySignal, OutreachMessage, Prospect, ProspectInput, ProspectStatus } from "./types";

/**
 * Pure rules for the mentor recruitment workflow. No I/O here so every rule
 * can be unit tested; see src/lib/services/recruitment.ts for orchestration.
 */

export const DEFAULT_SUBJECT_TEMPLATE = "Would you mentor students with UIS, {{first_name}}?";

export const DEFAULT_BODY_TEMPLATE = `Dear {{first_name}},

I'm writing from UIS (United International Society), a volunteer network that connects international university students with mentors and academic tutors.

Given your work as {{title}} at {{organization}}, we think students would value your perspective. {{community_line}}

Mentors choose how many students they support (often just one or two) and can pause at any time. There is no cost and no obligation.

If you'd like to take part, you can create an account here:
{{signup_link}}

After signing up you can complete a short mentor profile. The UIS team reviews every profile before students can see it.

Kind regards,
{{admin_name}}
UIS team

You received this one-off message because UIS identified you as a potential mentor. To stop hearing from us: {{unsubscribe_link}}`;

/** Placeholders filled at draft time from verified candidate data. */
export const PERSONAL_PLACEHOLDERS = [
  "first_name",
  "full_name",
  "organization",
  "title",
  "expertise",
  "community_line",
  "admin_name",
] as const;
/** Placeholders kept in the draft and filled only when the email is sent. */
export const LINK_PLACEHOLDERS = ["signup_link", "unsubscribe_link"] as const;
export const MISSING_MARKER = "[[MISSING:";

const PLACEHOLDER_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(email: string | null | undefined): email is string {
  return !!email && EMAIL_RE.test(email);
}

/** Reserved/test domains (RFC 2606/6761). Mock data uses these, so it can never be delivered. */
export function isReservedTestAddress(email: string): boolean {
  const domain = normalizeEmail(email).split("@")[1] ?? "";
  return (
    /\.(example|test|invalid|localhost)$/.test(domain) ||
    ["example.com", "example.net", "example.org"].includes(domain)
  );
}

/** Apollo search returns obfuscated surnames (e.g. "Ma***i"); those aren't usable in a greeting. */
export function isObfuscated(name: string | null | undefined): boolean {
  return !name || name.includes("*");
}

/** First name as given by the source. Never guessed or transliterated. */
export function verifiedFirstName(p: Pick<Prospect, "fullName">): string | null {
  const first = p.fullName.trim().split(/\s+/)[0];
  return first && !isObfuscated(first) ? first : null;
}

export interface RenderContext {
  adminName: string;
  communityName: string;
}

/**
 * Fill a template with verified information only. A placeholder whose value
 * isn't known becomes a visible `[[MISSING: …]]` marker that blocks approval
 * until an admin edits the text, so nothing is ever invented.
 */
export function renderTemplate(
  template: string,
  p: Prospect,
  ctx: RenderContext,
): { text: string; missing: string[] } {
  const values: Record<string, string | null> = {
    first_name: verifiedFirstName(p),
    full_name: isObfuscated(p.fullName) ? null : p.fullName.trim(),
    organization: p.organization?.trim() || null,
    title: p.title?.trim() || null,
    expertise: p.expertise?.trim() || null,
    // Optional sentence: only with admin-confirmed affiliation; otherwise omitted entirely.
    community_line:
      p.communityAffiliation === "confirmed" && p.affiliationEvidence
        ? `As someone connected to the ${ctx.communityName}, you would be especially well placed to help students settling into a new country.`
        : "",
    admin_name: ctx.adminName.trim() || null,
  };
  const missing = new Set<string>();
  const text = template.replace(PLACEHOLDER_RE, (whole, key: string) => {
    if ((LINK_PLACEHOLDERS as readonly string[]).includes(key)) return `{{${key}}}`;
    if (!(key in values)) {
      missing.add(key);
      return `${MISSING_MARKER} unknown placeholder ${key}]]`;
    }
    const v = values[key];
    if (v === null) {
      missing.add(key);
      return `${MISSING_MARKER} ${key.replace(/_/g, " ")}]]`;
    }
    return v;
  });
  return { text: text.replace(/[ \t]+\n/g, "\n"), missing: [...missing] };
}

export interface ApprovalCheckInput {
  message: Pick<OutreachMessage, "recipient" | "subject" | "body" | "status">;
  prospect: Prospect;
  suppressed: boolean;
  /** True when a real email provider would deliver the message. Test/mock data is only blocked then. */
  live: boolean;
}

/** Everything that must hold before an admin may approve (and again right before sending). */
export function approvalProblems({ message, prospect, suppressed, live }: ApprovalCheckInput): string[] {
  const problems: string[] = [];
  const r = message.recipient;
  if (!isValidEmail(r)) problems.push("There is no valid recipient email address.");
  else {
    if (normalizeEmail(r) !== normalizeEmail(prospect.email ?? "")) problems.push("The recipient differs from the candidate's email on file.");
    if (live && isReservedTestAddress(r)) problems.push("The address uses a reserved test domain and can't receive real email.");
  }
  if (live && (prospect.source === "apollo_mock" || prospect.source === "demo-seed"))
    problems.push("This candidate is fictional (mock or demo data) and can't receive real email.");
  if (prospect.emailStatus === "unavailable") problems.push("No email address is available for this candidate.");
  if (prospect.doNotContact || suppressed) problems.push("This person is on the do-not-contact list.");
  if (prospect.reviewStatus !== "approved") problems.push("The candidate hasn't been approved in review.");
  if (prospect.status === "declined" || prospect.status === "joined")
    problems.push(`The candidate is already marked as ${prospect.status}.`);
  const text = `${message.subject}\n${message.body}`;
  if (text.includes(MISSING_MARKER)) problems.push("The message still contains [[MISSING: …]] markers.");
  const unknown = [...text.matchAll(PLACEHOLDER_RE)]
    .map((m) => m[1])
    .filter((k) => !(LINK_PLACEHOLDERS as readonly string[]).includes(k));
  if (unknown.length) problems.push(`Unfilled placeholders: ${[...new Set(unknown)].join(", ")}.`);
  if (!message.body.includes("{{signup_link}}")) problems.push("The message must include {{signup_link}}.");
  if (!message.body.includes("{{unsubscribe_link}}")) problems.push("The message must include {{unsubscribe_link}}.");
  if (!message.subject.trim()) problems.push("The subject is empty.");
  return problems;
}

export function inviteLinks(siteUrl: string, m: Pick<OutreachMessage, "inviteToken" | "unsubscribeToken">) {
  const base = siteUrl.replace(/\/+$/, "");
  return {
    signup: `${base}/signup?invite=${encodeURIComponent(m.inviteToken)}`,
    /** Human-facing page with a confirm button (safe against link scanners). */
    unsubscribe: `${base}/unsubscribe?t=${encodeURIComponent(m.unsubscribeToken)}`,
    /** RFC 8058 one-click endpoint for the List-Unsubscribe header. */
    oneClick: `${base}/api/unsubscribe?t=${encodeURIComponent(m.unsubscribeToken)}`,
  };
}

/** Final text as delivered: link placeholders replaced. */
export function finalizeMessage(siteUrl: string, m: Pick<OutreachMessage, "subject" | "body" | "inviteToken" | "unsubscribeToken">) {
  const links = inviteLinks(siteUrl, m);
  const body = m.body.replaceAll("{{signup_link}}", links.signup).replaceAll("{{unsubscribe_link}}", links.unsubscribe);
  return { subject: m.subject, body, unsubscribeUrl: links.oneClick };
}

/** Countries/regions whose mention is recorded as an (unconfirmed) location signal. */
const COMMUNITY_PLACES: Record<string, RegExp> = {
  italian: /\b(italy|italia|italian|italiano|italiana)\b/i,
};

/**
 * Derive unconfirmed signals from explicit data fields (location, organization,
 * notes) only. Names are deliberately never inspected.
 */
export function communitySignals(
  communityId: string,
  fields: { location?: string | null; organization?: string | null; note?: string | null },
  source: string,
  at: string,
): CommunitySignal[] {
  const re = COMMUNITY_PLACES[communityId];
  const out: CommunitySignal[] = [];
  if (re && fields.location && re.test(fields.location))
    out.push({ kind: "location", detail: `Location: ${fields.location}`, source, recordedAt: at });
  if (re && fields.organization && re.test(fields.organization))
    out.push({ kind: "organization", detail: `Organization: ${fields.organization}`, source, recordedAt: at });
  if (fields.note?.trim()) out.push({ kind: "note", detail: fields.note.trim().slice(0, 300), source, recordedAt: at });
  return out;
}

/** Statuses an admin can set by hand. "joined" requires a linked account. */
export function canSetProspectStatus(p: Pick<Prospect, "joinedUserId">, to: ProspectStatus): string | null {
  if (to === "joined" && !p.joinedUserId) return "Link the candidate's UIS account before marking them as joined.";
  return null;
}

/** A complete candidate record with safe defaults (unreviewed, unconfirmed, not contacted). */
export function buildProspect(id: string, input: ProspectInput, importedBy: string | null, at: string): Prospect {
  const email = input.email ? normalizeEmail(input.email) : null;
  return {
    id,
    fullName: input.fullName,
    email,
    organization: input.organization ?? null,
    title: input.title ?? null,
    location: input.location ?? null,
    expertise: input.expertise ?? null,
    linkedinUrl: input.linkedinUrl ?? null,
    notes: input.notes ?? null,
    source: input.source ?? "csv",
    sourceRef: input.sourceRef ?? null,
    sourceDetail: input.sourceDetail ?? null,
    retrievedAt: input.retrievedAt ?? at,
    status: "new",
    reviewStatus: "unreviewed",
    reviewNote: null,
    emailStatus: input.emailStatus ?? (email ? "provided" : "none"),
    emailSource: input.emailSource ?? (email ? "csv" : null),
    enrichmentStatus: "not_requested",
    enrichmentError: null,
    enrichedAt: null,
    communityAffiliation: "unconfirmed",
    affiliationEvidence: null,
    affiliationReviewedBy: null,
    affiliationReviewedAt: null,
    communitySignals: input.communitySignals ?? [],
    doNotContact: false,
    joinedUserId: null,
    importedBy,
    createdAt: at,
    updatedAt: at,
  };
}
