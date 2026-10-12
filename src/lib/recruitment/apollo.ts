/**
 * Apollo.io adapter (official REST API only — no scraping, no LinkedIn automation).
 *
 * Endpoints (docs.apollo.io, checked 2026-10):
 *   POST /api/v1/mixed_people/api_search  — 0 credits; no emails; surname obfuscated.
 *   POST /api/v1/people/match             — enrichment; ~1 credit when an email or
 *                                           demographics are returned, 0 if nothing found.
 * Auth: `x-api-key` header. The key must be scoped to these endpoints (or be a master key).
 */

import type { Env } from "../config";

export interface ApolloSearchParams {
  /** Free-text keywords, used for expertise (Apollo `q_keywords`). */
  keywords?: string;
  /** Job titles (Apollo `person_titles[]`). */
  titles?: string[];
  /** Organization domains, e.g. "example.com" (Apollo `q_organization_domains_list[]`). */
  organizationDomains?: string[];
  /** Person locations, e.g. "Milan, Italy" (Apollo `person_locations[]`). */
  locations?: string[];
  page?: number;
  perPage?: number;
}

export interface ApolloSearchPerson {
  id: string;
  /** First name plus obfuscated surname as returned by search, e.g. "Marta R***i". */
  displayName: string;
  title: string | null;
  organization: string | null;
  hasEmail: boolean;
}

export interface ApolloSearchResult {
  people: ApolloSearchPerson[];
  total: number;
  page: number;
  perPage: number;
}

export interface ApolloEnrichment {
  matchConfidence: "high" | "medium" | "low" | "none" | null;
  fullName: string | null;
  title: string | null;
  organization: string | null;
  location: string | null;
  linkedinUrl: string | null;
  email: string | null;
  /** Apollo's email_status, e.g. "verified"; null when there is no email. */
  emailStatus: string | null;
}

export type ApolloErrorKind =
  | "missing_credentials"
  | "unauthorized"
  | "forbidden"
  | "credits_exhausted"
  | "rate_limited"
  | "invalid_request"
  | "unavailable";

export class ApolloError extends Error {
  constructor(
    public kind: ApolloErrorKind,
    message: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApolloError";
  }
}

export interface ProspectSource {
  readonly mode: "live" | "mock";
  search(params: ApolloSearchParams): Promise<ApolloSearchResult>;
  /** Enrich one person by Apollo id. Spends credits in live mode. */
  enrich(input: { apolloId: string | null; fullName: string; organization: string | null; linkedinUrl: string | null }): Promise<ApolloEnrichment>;
}

const BASE = "https://api.apollo.io/api/v1";

export class ApolloClient implements ProspectSource {
  readonly mode = "live" as const;
  constructor(
    private apiKey: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async call(path: string, params: URLSearchParams): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${BASE}${path}?${params}`, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new ApolloError("unavailable", "Couldn't reach Apollo. Check your connection and try again.");
    }
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      // 401 responses are plain text.
    }
    if (res.ok) return body;
    const message = String(body.error ?? body.message ?? text ?? "").slice(0, 300);
    throw toApolloError(res.status, message, body, res.headers.get("retry-after"));
  }

  async search(p: ApolloSearchParams): Promise<ApolloSearchResult> {
    const q = new URLSearchParams();
    if (p.keywords) q.set("q_keywords", p.keywords);
    p.titles?.forEach((t) => q.append("person_titles[]", t));
    p.organizationDomains?.forEach((d) => q.append("q_organization_domains_list[]", d));
    p.locations?.forEach((l) => q.append("person_locations[]", l));
    const page = p.page ?? 1;
    const perPage = Math.min(p.perPage ?? 25, 100);
    q.set("page", String(page));
    q.set("per_page", String(perPage));
    const body = await this.call("/mixed_people/api_search", q);
    const people = Array.isArray(body.people) ? (body.people as Record<string, unknown>[]) : [];
    return {
      total: Number(body.total_entries ?? people.length),
      page,
      perPage,
      people: people.map((x) => ({
        id: String(x.id),
        displayName: [x.first_name, x.last_name_obfuscated].filter(Boolean).join(" ") || "Unknown",
        title: (x.title as string) ?? null,
        organization: ((x.organization as Record<string, unknown> | undefined)?.name as string) ?? null,
        hasEmail: x.has_email === true,
      })),
    };
  }

  async enrich(input: Parameters<ProspectSource["enrich"]>[0]): Promise<ApolloEnrichment> {
    const q = new URLSearchParams();
    if (input.apolloId) q.set("id", input.apolloId);
    else {
      q.set("name", input.fullName);
      if (input.organization) q.set("organization_name", input.organization);
      if (input.linkedinUrl) q.set("linkedin_url", input.linkedinUrl);
    }
    // Work email only: personal emails and phone numbers are never requested.
    q.set("reveal_personal_emails", "false");
    q.set("reveal_phone_number", "false");
    const body = await this.call("/people/match", q);
    const person = (body.person as Record<string, unknown> | null) ?? null;
    if (!person) return emptyEnrichment("none");
    const org = person.organization as Record<string, unknown> | undefined;
    return {
      matchConfidence: (person.match_confidence as ApolloEnrichment["matchConfidence"]) ?? null,
      fullName: (person.name as string) ?? null,
      title: (person.title as string) ?? null,
      organization: (org?.name as string) ?? null,
      location: [person.city, person.state, person.country].filter(Boolean).join(", ") || null,
      linkedinUrl: (person.linkedin_url as string) ?? null,
      email: (person.email as string) || null,
      emailStatus: (person.email_status as string) ?? null,
    };
  }
}

function emptyEnrichment(conf: ApolloEnrichment["matchConfidence"]): ApolloEnrichment {
  return { matchConfidence: conf, fullName: null, title: null, organization: null, location: null, linkedinUrl: null, email: null, emailStatus: null };
}

export function toApolloError(status: number, message: string, body: Record<string, unknown> = {}, retryAfter?: string | null): ApolloError {
  // Apollo doesn't document an out-of-credits code; it has been observed as a 422
  // "You are out of credits" message, so we match on the text as well as 402.
  if (status === 402 || /credit/i.test(message))
    return new ApolloError("credits_exhausted", "Apollo reports that the account is out of credits (or the per-user credit limit was reached). No further enrichment is possible until credits are added.");
  if (status === 401) return new ApolloError("unauthorized", "Apollo rejected the API key. Check APOLLO_API_KEY.");
  if (status === 403)
    return new ApolloError("forbidden", "This Apollo API key isn't allowed to call this endpoint. Use a key scoped to people search/enrichment or a master key.");
  if (status === 429) {
    const seconds = Number(body.retry_after_seconds ?? retryAfter ?? NaN);
    return new ApolloError("rate_limited", `Apollo rate limit reached${Number.isFinite(seconds) ? `; try again in about ${Math.ceil(seconds / 60)} minute(s)` : ""}.`, Number.isFinite(seconds) ? seconds : undefined);
  }
  if (status === 400 || status === 422) return new ApolloError("invalid_request", `Apollo couldn't process the request: ${message || "invalid parameters"}.`);
  return new ApolloError("unavailable", `Apollo returned an error (${status}). Try again later.`);
}

/**
 * MOCK adapter for local development. Returns obviously fictional people at
 * reserved `.example` domains; records saved from it are tagged `apollo_mock`
 * and can never be emailed. Keywords containing "mock:<kind>" simulate errors.
 */
export class MockApollo implements ProspectSource {
  readonly mode = "mock" as const;

  private failIfAsked(text: string) {
    const m = text.match(/mock:(credits|rate|auth|error)/);
    if (!m) return;
    if (m[1] === "credits") throw toApolloError(422, "You are out of credits!");
    if (m[1] === "rate") throw toApolloError(429, "rate limited", { retry_after_seconds: 600 });
    if (m[1] === "auth") throw toApolloError(401, "Invalid API key");
    throw toApolloError(503, "unavailable");
  }

  async search(p: ApolloSearchParams): Promise<ApolloSearchResult> {
    this.failIfAsked([p.keywords, ...(p.titles ?? [])].join(" "));
    const perPage = Math.min(p.perPage ?? 25, 100);
    const page = p.page ?? 1;
    const role = p.titles?.[0] ?? "Engineer";
    const org = p.organizationDomains?.[0]?.replace(/\..*$/, "") ?? "Example";
    const total = 6;
    const people = Array.from({ length: Math.max(0, Math.min(perPage, total - (page - 1) * perPage)) }, (_, i) => {
      const n = (page - 1) * perPage + i + 1;
      return {
        id: `mock-apollo-${n}-${slug(p.keywords ?? "")}-${slug(role)}`,
        displayName: `Mock Candidate ${n} M***k`,
        title: `${role} (mock)`,
        organization: `${capitalize(org)} Mock Org`,
        hasEmail: n % 3 !== 0,
      };
    });
    return { people, total, page, perPage };
  }

  async enrich(input: Parameters<ProspectSource["enrich"]>[0]): Promise<ApolloEnrichment> {
    this.failIfAsked(input.fullName);
    const n = Number(input.apolloId?.match(/^mock-apollo-(\d+)/)?.[1] ?? 1);
    if (n % 3 === 0) return { ...emptyEnrichment("high"), fullName: `Mock Candidate ${n} Mock`, title: "Mock title" };
    return {
      matchConfidence: "high",
      fullName: `Mock Candidate ${n} Mock`,
      title: "Senior Engineer (mock)",
      organization: input.organization,
      location: n % 2 ? "Milan, Lombardy, Italy" : "London, England, United Kingdom",
      linkedinUrl: null,
      email: `mock.candidate.${n}@mock-apollo.example`,
      emailStatus: n % 2 ? "verified" : "unverified",
    };
  }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "x";
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type ApolloConfig = { mode: "live"; source: ProspectSource } | { mode: "mock"; source: ProspectSource } | { mode: "unconfigured"; reason: string };

export function apolloConfig(env: Env, demo: boolean): ApolloConfig {
  if (env.APOLLO_API_KEY && env.APOLLO_MOCK !== "true") return { mode: "live", source: new ApolloClient(env.APOLLO_API_KEY) };
  if (demo || env.APOLLO_MOCK === "true") return { mode: "mock", source: new MockApollo() };
  return { mode: "unconfigured", reason: "APOLLO_API_KEY is not set. Add a scoped Apollo API key to enable search and enrichment (or set APOLLO_MOCK=true for fictional test data)." };
}
