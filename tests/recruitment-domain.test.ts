import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  approvalProblems,
  buildProspect,
  communitySignals,
  DEFAULT_BODY_TEMPLATE,
  finalizeMessage,
  isReservedTestAddress,
  renderTemplate,
} from "@/lib/domain/recruitment";
import type { Prospect } from "@/lib/domain/types";
import { ApolloClient, MockApollo, toApolloError } from "@/lib/recruitment/apollo";
import { MockSender, ResendSender, sendingStatus } from "@/lib/recruitment/sender";
import { toDeliveryEvent, verifyWebhook } from "@/lib/recruitment/webhook";

const T = "2026-10-01T00:00:00.000Z";
const prospect = (over: Partial<Prospect> = {}): Prospect => ({
  ...buildProspect("p1", { fullName: "Giulia Rossi", email: "giulia@university.edu", organization: "Example Labs", expertise: "Statistics", linkedinUrl: null, notes: null, title: "Data Scientist" }, null, T),
  reviewStatus: "approved",
  ...over,
});
const ctx = { adminName: "Chiara Bianchi", communityName: "Italian community" };

describe("community relevance", () => {
  it("never derives a signal from a name", () => {
    expect(communitySignals("italian", { location: null, organization: null, note: null }, "CSV", T)).toEqual([]);
    const p = buildProspect("x", { fullName: "Giuseppe Esposito", email: null, organization: null, expertise: null, linkedinUrl: null, notes: null }, null, T);
    expect(p.communitySignals).toEqual([]);
    expect(p.communityAffiliation).toBe("unconfirmed");
  });

  it("records location and notes as unconfirmed signals with their source", () => {
    const s = communitySignals("italian", { location: "Milan, Italy", organization: "Acme", note: "Met at the Italian alumni dinner" }, "CSV import", T);
    expect(s).toEqual([
      { kind: "location", detail: "Location: Milan, Italy", source: "CSV import", recordedAt: T },
      { kind: "note", detail: "Met at the Italian alumni dinner", source: "CSV import", recordedAt: T },
    ]);
  });

  it("only mentions the community in a message when an admin confirmed it with evidence", () => {
    const unconfirmed = renderTemplate("Hi.{{community_line}}", prospect({ communitySignals: [{ kind: "location", detail: "Rome", source: "x", recordedAt: T }] }), ctx);
    expect(unconfirmed.text).toBe("Hi.");
    expect(unconfirmed.missing).toEqual([]);
    const confirmed = renderTemplate("{{community_line}}", prospect({ communityAffiliation: "confirmed", affiliationEvidence: "Said so on a call" }), ctx);
    expect(confirmed.text).toMatch(/Italian community/);
  });
});

describe("invitation templates", () => {
  it("fills only verified fields and marks anything missing", () => {
    const r = renderTemplate("Dear {{first_name}}, as {{title}} at {{organization}}… {{signup_link}}", prospect({ title: null }), ctx);
    expect(r.text).toBe("Dear Giulia, as [[MISSING: title]] at Example Labs… {{signup_link}}");
    expect(r.missing).toEqual(["title"]);
  });

  it("refuses to greet with an obfuscated Apollo name", () => {
    const r = renderTemplate("Dear {{first_name}}", prospect({ fullName: "M***a R***i" }), ctx);
    expect(r.text).toContain("[[MISSING: first name]]");
  });

  it("keeps link placeholders until sending, then fills them", () => {
    const body = renderTemplate(DEFAULT_BODY_TEMPLATE, prospect(), ctx).text;
    expect(body).toContain("{{signup_link}}");
    const final = finalizeMessage("https://uis.example.org/", { subject: "s", body, inviteToken: "inv_".padEnd(30, "a"), unsubscribeToken: "uns_".padEnd(30, "b") });
    expect(final.body).toContain("https://uis.example.org/signup?invite=inv_");
    expect(final.body).toContain("https://uis.example.org/unsubscribe?t=uns_");
    expect(final.body).not.toContain("{{");
    expect(final.unsubscribeUrl).toBe(`https://uis.example.org/api/unsubscribe?t=${"uns_".padEnd(30, "b")}`);
  });
});

describe("approval rules", () => {
  const ok = { recipient: "giulia@university.edu", subject: "Hi", body: "Hello {{signup_link}} {{unsubscribe_link}}", status: "draft" as const };

  it("accepts a complete, consented message", () => {
    expect(approvalProblems({ message: ok, prospect: prospect(), suppressed: false, live: true })).toEqual([]);
  });

  it.each([
    ["missing markers", { ...ok, body: "[[MISSING: title]] {{signup_link}} {{unsubscribe_link}}" }, {}, false],
    ["no unsubscribe link", { ...ok, body: "{{signup_link}}" }, {}, false],
    ["unknown placeholder", { ...ok, body: "{{nickname}} {{signup_link}} {{unsubscribe_link}}" }, {}, false],
    ["recipient changed", { ...ok, recipient: "other@university.edu" }, {}, false],
    ["unreviewed candidate", ok, { reviewStatus: "unreviewed" as const }, false],
    ["declined candidate", ok, { status: "declined" as const }, false],
    ["do-not-contact", ok, { doNotContact: true }, false],
    ["suppressed address", ok, {}, true],
  ])("blocks %s", (_, message, over, suppressed) => {
    expect(approvalProblems({ message, prospect: prospect(over), suppressed, live: false }).length).toBeGreaterThan(0);
  });

  it("allows mock/demo data to be approved for a mock run but never for live sending", () => {
    const fake = prospect({ source: "apollo_mock", email: "a@mock-apollo.example" });
    const msg = { ...ok, recipient: "a@mock-apollo.example" };
    expect(approvalProblems({ message: msg, prospect: fake, suppressed: false, live: false })).toEqual([]);
    expect(approvalProblems({ message: msg, prospect: fake, suppressed: false, live: true }).length).toBe(2);
    expect(isReservedTestAddress("x@uis-demo.example")).toBe(true);
    expect(isReservedTestAddress("x@university.edu")).toBe(false);
  });
});

describe("Apollo adapter", () => {
  it("calls the documented search endpoint with the API key header and filters", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ total_entries: 1, people: [{ id: "a1", first_name: "Marta", last_name_obfuscated: "R***i", title: "CTO", has_email: true, organization: { name: "Acme" } }] })));
    const res = await new ApolloClient("key123", fetchImpl as never).search({ keywords: "robotics", titles: ["CTO"], locations: ["Italy"], organizationDomains: ["acme.com"] });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/api\.apollo\.io\/api\/v1\/mixed_people\/api_search\?/);
    expect(decodeURIComponent(url)).toContain("person_titles[]=CTO");
    expect(decodeURIComponent(url)).toContain("person_locations[]=Italy");
    expect(decodeURIComponent(url)).toContain("q_organization_domains_list[]=acme.com");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("key123");
    expect(res.people[0]).toEqual({ id: "a1", displayName: "Marta R***i", title: "CTO", organization: "Acme", hasEmail: true });
  });

  it("never asks enrichment for personal emails or phone numbers", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ person: { name: "Marta Rossi", email: "m@acme.com", email_status: "verified", match_confidence: "high" } })));
    const e = await new ApolloClient("k", fetchImpl as never).enrich({ apolloId: "a1", fullName: "Marta R***i", organization: null, linkedinUrl: null });
    const url = String((fetchImpl.mock.calls[0] as unknown as [string])[0]);
    expect(url).toContain("/people/match?");
    expect(url).toContain("reveal_personal_emails=false");
    expect(url).toContain("reveal_phone_number=false");
    expect(e).toMatchObject({ email: "m@acme.com", emailStatus: "verified", fullName: "Marta Rossi" });
  });

  it.each([
    [401, "Invalid API key", "unauthorized"],
    [403, "not permitted", "forbidden"],
    [422, "You are out of credits!", "credits_exhausted"],
    [402, "", "credits_exhausted"],
    [429, "limit", "rate_limited"],
    [422, "bad param", "invalid_request"],
    [503, "", "unavailable"],
  ])("maps HTTP %i (%s) to %s", (status, message, kind) => {
    expect(toApolloError(status, message).kind).toBe(kind);
  });

  it("turns network failures into a visible 'unavailable' error", async () => {
    const client = new ApolloClient("k", (async () => {
      throw new TypeError("fetch failed");
    }) as never);
    await expect(client.search({ keywords: "x" })).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("mock data is fictional and uses reserved domains", async () => {
    const mock = new MockApollo();
    const r = await mock.search({ keywords: "ai" });
    expect(r.people.every((p) => p.displayName.startsWith("Mock Candidate"))).toBe(true);
    const e = await mock.enrich({ apolloId: r.people[0].id, fullName: "x", organization: null, linkedinUrl: null });
    expect(isReservedTestAddress(e.email!)).toBe(true);
    await expect(mock.search({ keywords: "mock:credits" })).rejects.toMatchObject({ kind: "credits_exhausted" });
  });
});

describe("email adapters", () => {
  it("sending is off by default and falls back to the mock sender", () => {
    const s = sendingStatus({}, false, true);
    expect(s.live).toBe(false);
    expect(s.sender.kind).toBe("mock");
    expect(sendingStatus({ RESEND_API_KEY: "re", OUTREACH_FROM_EMAIL: "a@b.org", NEXT_PUBLIC_SITE_URL: "https://x.org" }, false, false).live).toBe(false);
    expect(sendingStatus({ RESEND_API_KEY: "re", OUTREACH_FROM_EMAIL: "a@b.org", NEXT_PUBLIC_SITE_URL: "https://x.org" }, true, true).live).toBe(false);
    expect(sendingStatus({ RESEND_API_KEY: "re", OUTREACH_FROM_EMAIL: "a@b.org", NEXT_PUBLIC_SITE_URL: "https://x.org" }, false, true).live).toBe(true);
  });

  it("the mock sender never reports a successful send", async () => {
    expect((await new MockSender().send()).outcome).toBe("mock_logged");
  });

  it("Resend sender passes an idempotency key and unsubscribe headers, and reports failures", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "re_1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "validation_error", message: "Invalid `to`" }), { status: 422 }));
    const sender = new ResendSender("re_key", "UIS <hi@uis.org>", undefined, fetchImpl as never);
    const msg = { idempotencyKey: "uis-invite-1", to: "a@university.edu", subject: "s", body: "b", unsubscribeUrl: "https://x/api/unsubscribe?t=1" };
    expect(await sender.send(msg)).toEqual({ outcome: "sent", providerMessageId: "re_1" });
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("uis-invite-1");
    expect(JSON.parse(String(init.body)).headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(await sender.send(msg)).toMatchObject({ outcome: "failed" });
  });
});

describe("delivery webhook", () => {
  const secret = `whsec_${Buffer.from("test-secret-key").toString("base64")}`;
  const sign = (id: string, ts: string, body: string) =>
    `v1,${createHmac("sha256", Buffer.from("test-secret-key")).update(`${id}.${ts}.${body}`).digest("base64")}`;

  it("accepts valid signatures and rejects tampering or stale timestamps", () => {
    const body = JSON.stringify({ type: "email.bounced", data: { email_id: "re_1" } });
    const now = 1_800_000_000;
    const headers = { id: "msg_1", timestamp: String(now), signature: sign("msg_1", String(now), body) };
    expect(verifyWebhook(secret, headers, body, now)).toBe(true);
    expect(verifyWebhook(secret, headers, body + " ", now)).toBe(false);
    expect(verifyWebhook(secret, headers, body, now + 600)).toBe(false);
  });

  it("only maps bounces and complaints; opens and deliveries are ignored, and nothing is treated as a reply", () => {
    expect(toDeliveryEvent({ type: "email.bounced", data: { email_id: "re_1", bounce: { message: "Mailbox full" } } })).toEqual({ kind: "bounced", providerMessageId: "re_1", detail: "Mailbox full" });
    expect(toDeliveryEvent({ type: "email.complained", data: { email_id: "re_1" } })?.kind).toBe("complaint");
    expect(toDeliveryEvent({ type: "email.delivered", data: { email_id: "re_1" } })).toBeNull();
    expect(toDeliveryEvent({ type: "email.opened", data: { email_id: "re_1" } })).toBeNull();
  });
});
