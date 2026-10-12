import { beforeEach, describe, expect, it, vi } from "vitest";
import { DemoStore } from "@/lib/data/demo-store";
import { DEMO_IDS, seedAccounts } from "@/lib/data/seed";
import type { Actor, Prospect } from "@/lib/domain/types";
import { MockApollo, type ApolloConfig, type ProspectSource } from "@/lib/recruitment/apollo";
import * as svc from "@/lib/services";
import type { ServiceContext } from "@/lib/services";
import { WINTER } from "./fixtures";

const LIVE_ENV = { RESEND_API_KEY: "re_test", OUTREACH_FROM_EMAIL: "UIS <invite@uis.org>", NEXT_PUBLIC_SITE_URL: "https://uis.org" };
const BEATRICE = "00000000-0000-4000-8000-000000000201"; // seed: reviewed, affiliation confirmed

let store: DemoStore;
let fetchImpl: ReturnType<typeof vi.fn>;
let apollo: ApolloConfig;
let env: Record<string, string | undefined>;
let demo: boolean;
let tokenN = 0;

function actor(id: string): Actor {
  const a = seedAccounts.find((x) => x.id === id)!;
  return { userId: a.id, email: a.email, fullName: a.fullName, role: a.role };
}

function ctx(id: string | null = DEMO_IDS.admin): ServiceContext {
  const a = id ? (seedAccounts.find((x) => x.id === id) ? actor(id) : { userId: id, email: "new@university.edu", fullName: "New Mentor", role: "member" as const }) : null;
  return {
    store,
    actor: a,
    now: () => WINTER,
    recruitment: { apollo, env, demo, fetchImpl: fetchImpl as never, token: () => `tok-${++tokenN}`.padEnd(32, "x") },
  };
}

/** Real-looking (non-reserved) candidate so the live path is exercised. */
async function realCandidate(email = "ada@university.edu", name = "Ada Lovelace"): Promise<Prospect> {
  await svc.importProspectsCsv(ctx(), `full_name,email,organization,title\n${name},${email},Analytical Society,Mathematician`);
  const p = (await store.listProspects()).find((x) => x.email === email)!;
  await svc.reviewCandidate(ctx(), p.id, "approved", null);
  return (await store.getProspect(p.id))!;
}

async function approvedDraft(prospectId: string) {
  const { message } = await svc.createDraft(ctx(), prospectId);
  return svc.approveDraft(ctx(), message.id);
}

async function enableLiveSending() {
  env = LIVE_ENV;
  demo = false;
  const s = await svc.getOutreachSettings(ctx());
  await svc.saveOutreachSettings(ctx(), { ...s, sendingEnabled: true });
}

const okResponse = (id = "re_msg_1") => new Response(JSON.stringify({ id }), { status: 200 });

beforeEach(() => {
  store = new DemoStore();
  fetchImpl = vi.fn(async () => okResponse());
  apollo = { mode: "mock", source: new MockApollo() };
  env = {};
  demo = true;
});

describe("admin-only access", () => {
  const calls: [string, (c: ServiceContext) => Promise<unknown>][] = [
    ["listCandidates", (c) => svc.listCandidates(c)],
    ["getCandidate", (c) => svc.getCandidate(c, BEATRICE)],
    ["importProspectsCsv", (c) => svc.importProspectsCsv(c, "full_name\nEve")],
    ["searchApollo", (c) => svc.searchApollo(c, { keywords: "ai" })],
    ["saveApolloCandidates", (c) => svc.saveApolloCandidates(c, [{ id: "m1", displayName: "X", title: null, organization: null, hasEmail: true }], {})],
    ["enrichCandidates", (c) => svc.enrichCandidates(c, [BEATRICE])],
    ["reviewCandidate", (c) => svc.reviewCandidate(c, BEATRICE, "approved", null)],
    ["setAffiliation", (c) => svc.setAffiliation(c, BEATRICE, "confirmed", "Some evidence here")],
    ["createDraft", (c) => svc.createDraft(c, BEATRICE)],
    ["approveDraft", (c) => svc.approveDraft(c, "x")],
    ["sendApprovedBatch", (c) => svc.sendApprovedBatch(c)],
    ["saveOutreachSettings", (c) => svc.saveOutreachSettings(c, { subjectTemplate: "s", bodyTemplate: "{{signup_link}}{{unsubscribe_link}}", batchLimit: 5, sendingEnabled: false })],
    ["listSuppressions", (c) => svc.listSuppressions(c)],
    ["addSuppression", (c) => svc.addSuppression(c, "x@university.edu", null)],
    ["linkCandidateAccount", (c) => svc.linkCandidateAccount(c, BEATRICE)],
  ];

  it.each(calls)("%s rejects students, mentors and anonymous users", async (_, fn) => {
    await expect(fn(ctx(null))).rejects.toMatchObject({ code: "unauthenticated" });
    for (const id of [DEMO_IDS.luca, DEMO_IDS.marco]) await expect(fn(ctx(id))).rejects.toMatchObject({ code: "forbidden" });
  });

  it("never exposes candidate emails to students or mentors", async () => {
    await realCandidate();
    const student = JSON.stringify(await svc.getStudentDashboard(ctx(DEMO_IDS.luca)));
    const mentor = JSON.stringify(await svc.getProviderDashboard(ctx(DEMO_IDS.marco)));
    for (const json of [student, mentor]) {
      expect(json).not.toContain("ada@university.edu");
      expect(json).not.toContain("beatrice.santoro");
    }
  });
});

describe("sourcing and enrichment", () => {
  it("reports missing Apollo credentials visibly", async () => {
    apollo = { mode: "unconfigured", reason: "APOLLO_API_KEY is not set." };
    expect(await svc.searchApollo(ctx(), { keywords: "ai" })).toEqual({ ok: false, kind: "missing_credentials", message: "APOLLO_API_KEY is not set." });
    expect((await svc.enrichCandidates(ctx(), [BEATRICE])).stopped?.kind).toBe("missing_credentials");
  });

  it("saves search results with source, provenance and retrieval date, labelled as mock", async () => {
    const r = await svc.searchApollo(ctx(), { keywords: "robotics", locations: ["Italy"] });
    if (!r.ok) throw new Error(r.message);
    await svc.saveApolloCandidates(ctx(), r.value.people.slice(0, 2), { keywords: "robotics", locations: ["Italy"] });
    const saved = (await store.listProspects()).filter((p) => p.source === "apollo_mock");
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({ reviewStatus: "unreviewed", email: null, communityAffiliation: "unconfirmed", retrievedAt: WINTER.toISOString() });
    expect(saved[0].sourceDetail).toContain('keywords "robotics"');
    expect(saved[0].communitySignals[0].detail).toContain("location filter");
    // Saving again is deduplicated by Apollo id.
    expect((await svc.saveApolloCandidates(ctx(), r.value.people.slice(0, 2), {})).duplicates).toBe(2);
  });

  it("spends nothing on unreviewed candidates and never re-enriches", async () => {
    const source: ProspectSource = { mode: "mock", search: vi.fn(), enrich: vi.fn(new MockApollo().enrich.bind(new MockApollo())) };
    apollo = { mode: "mock", source };
    const r = await new MockApollo().search({ keywords: "x" });
    await svc.saveApolloCandidates(ctx(), [r.people[0]], {});
    const p = (await store.listProspects()).find((x) => x.source === "apollo_mock")!;
    const first = await svc.enrichCandidates(ctx(), [p.id]);
    expect(first.results[0].outcome).toMatch(/approve the candidate/);
    expect(source.enrich).not.toHaveBeenCalled();
    await svc.reviewCandidate(ctx(), p.id, "approved", null);
    await svc.enrichCandidates(ctx(), [p.id]);
    expect(source.enrich).toHaveBeenCalledTimes(1);
    const again = await svc.enrichCandidates(ctx(), [p.id]);
    expect(again.results[0].outcome).toMatch(/already/);
    expect(source.enrich).toHaveBeenCalledTimes(1);
    expect((await store.getProspect(p.id))!.email).toMatch(/@mock-apollo\.example$/);
  });

  it("stops the batch and records the error when credits run out", async () => {
    const source: ProspectSource = {
      mode: "live",
      search: vi.fn(),
      enrich: vi.fn(async () => {
        const { toApolloError } = await import("@/lib/recruitment/apollo");
        throw toApolloError(422, "You are out of credits!");
      }),
    };
    apollo = { mode: "live", source };
    const ids: string[] = [];
    for (const n of [1, 2]) {
      await svc.importProspectsCsv(ctx(), `full_name,organization\nPerson ${n},Org ${n}`);
      const p = (await store.listProspects()).find((x) => x.fullName === `Person ${n}`)!;
      await svc.reviewCandidate(ctx(), p.id, "approved", null);
      ids.push(p.id);
    }
    const report = await svc.enrichCandidates(ctx(), ids);
    expect(report.stopped?.kind).toBe("credits_exhausted");
    expect(source.enrich).toHaveBeenCalledTimes(1);
    expect(report.results[1].outcome).toMatch(/Not attempted/);
    expect((await store.getProspect(ids[0]))!).toMatchObject({ enrichmentStatus: "error" });
  });

  it("records 'no email available' honestly", async () => {
    const r = await new MockApollo().search({ keywords: "x" });
    await svc.saveApolloCandidates(ctx(), [r.people[2]], {}); // mock #3 has no email
    const p = (await store.listProspects()).find((x) => x.source === "apollo_mock")!;
    await svc.reviewCandidate(ctx(), p.id, "approved", null);
    await svc.enrichCandidates(ctx(), [p.id]);
    expect(await store.getProspect(p.id)).toMatchObject({ email: null, emailStatus: "unavailable", enrichmentStatus: "no_email" });
  });

  it("requires written evidence to confirm a community link", async () => {
    await expect(svc.setAffiliation(ctx(), BEATRICE, "confirmed", "")).rejects.toMatchObject({ code: "validation" });
    const p = await svc.setAffiliation(ctx(), BEATRICE, "not_affiliated", "Told us she has no link");
    expect(p.communityAffiliation).toBe("not_affiliated");
  });
});

describe("drafting and approval", () => {
  it("marks unverified fields and blocks approval until edited", async () => {
    await svc.importProspectsCsv(ctx(), "full_name,email\nGrace Hopper,grace@university.edu");
    const p = (await store.listProspects()).find((x) => x.email === "grace@university.edu")!;
    await svc.reviewCandidate(ctx(), p.id, "approved", null);
    const { message, missing } = await svc.createDraft(ctx(), p.id);
    expect(missing).toEqual(expect.arrayContaining(["title", "organization"]));
    expect(message.body).not.toMatch(/Italian/); // no confirmed affiliation → no community line
    await expect(svc.approveDraft(ctx(), message.id)).rejects.toThrow(/MISSING/);
    const fixed = message.body.replace(/Given your work as .*perspective\./, "We'd value your perspective.");
    await svc.updateDraft(ctx(), message.id, { subject: message.subject, body: fixed });
    expect((await svc.approveDraft(ctx(), message.id)).status).toBe("approved");
  });

  it("revokes approval when the text is edited", async () => {
    const m = await approvedDraft(BEATRICE);
    const edited = await svc.updateDraft(ctx(), m.id, { subject: m.subject + "!", body: m.body });
    expect(edited).toMatchObject({ status: "draft", approvedHash: null, approvedBy: null });
  });

  it("allows only one open draft per candidate", async () => {
    await svc.createDraft(ctx(), BEATRICE);
    await expect(svc.createDraft(ctx(), BEATRICE)).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("sending", () => {
  it("is off by default: a batch only produces mock records, never 'sent'", async () => {
    const m = await approvedDraft(BEATRICE);
    const r = await svc.sendApprovedBatch(ctx());
    expect(r.live).toBe(false);
    expect(r.results[0].outcome).toBe("mock_logged");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await store.getOutreachMessage(m.id))!.status).toBe("mock_logged");
    expect((await store.getProspect(BEATRICE))!.status).toBe("new"); // not marked invited
  });

  it("can't be switched on until a sending account is configured", async () => {
    const s = await svc.getOutreachSettings(ctx());
    await expect(svc.saveOutreachSettings(ctx(), { ...s, sendingEnabled: true })).rejects.toThrow(/can't be turned on/);
  });

  it("refuses to send real email to mock or demo data", async () => {
    const m = await approvedDraft(BEATRICE); // seed candidate at a reserved .example domain
    await enableLiveSending();
    const r = await svc.sendApprovedBatch(ctx());
    expect(r.results[0].outcome).toBe("skipped");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await store.getOutreachMessage(m.id))!.status).toBe("draft");
  });

  it("sends an approved message once and marks the candidate invited", async () => {
    const p = await realCandidate();
    await approvedDraft(p.id);
    await enableLiveSending();
    const r = await svc.sendApprovedBatch(ctx());
    expect(r.results[0].outcome).toBe("sent");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchImpl.mock.calls[0][1] as RequestInit).body));
    expect(body.to).toEqual(["ada@university.edu"]);
    expect(body.text).toContain("https://uis.org/signup?invite=");
    expect(body.text).not.toContain("{{");
    expect((await store.getProspect(p.id))!.status).toBe("invited");
  });

  it("prevents duplicate sends from double clicks", async () => {
    const p = await realCandidate();
    await approvedDraft(p.id);
    await enableLiveSending();
    const [a, b] = await Promise.all([svc.sendApprovedBatch(ctx()), svc.sendApprovedBatch(ctx())]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect([...a.results, ...b.results].filter((x) => x.outcome === "sent")).toHaveLength(1);
    await svc.sendApprovedBatch(ctx());
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a failed send with the same idempotency key, and only once it has failed", async () => {
    const p = await realCandidate();
    const m = await approvedDraft(p.id);
    await enableLiveSending();
    fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ name: "internal_server_error", message: "boom" }), { status: 500 }));
    const first = await svc.sendApprovedBatch(ctx());
    expect(first.results[0].outcome).toBe("failed");
    expect((await store.getOutreachMessage(m.id))!.lastError).toMatch(/500/);
    expect((await store.getProspect(p.id))!.status).toBe("new"); // a failure is not a reply or an invite
    const retry = await svc.retryFailedMessage(ctx(), m.id);
    expect(retry.outcome).toBe("sent");
    const keys = fetchImpl.mock.calls.map((c) => (c[1] as RequestInit & { headers: Record<string, string> }).headers["Idempotency-Key"]);
    expect(keys).toEqual([`uis-invite-${m.id}`, `uis-invite-${m.id}`]);
    expect((await svc.retryFailedMessage(ctx(), m.id)).outcome).toBe("skipped");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("blocks a second invitation to someone already invited", async () => {
    const p = await realCandidate();
    await approvedDraft(p.id);
    await enableLiveSending();
    await svc.sendApprovedBatch(ctx());
    await expect(svc.createDraft(ctx(), p.id)).rejects.toMatchObject({ code: "conflict" });
    // Even bypassing the service, the store refuses a second sending/sent message for the candidate.
    const extra = await store.createOutreachMessage({ prospectId: p.id, recipient: p.email, subject: "s", body: "b", inviteToken: "i".repeat(30), unsubscribeToken: "u".repeat(30), createdBy: null });
    await expect(store.updateOutreachMessage(extra.id, { status: "sending" }, ["draft"])).rejects.toMatchObject({ code: "conflict" });
  });

  it("respects the configured batch limit", async () => {
    for (const n of [1, 2, 3]) await approvedDraft((await realCandidate(`p${n}@university.edu`, `Person ${n}`)).id);
    await enableLiveSending();
    const s = await svc.getOutreachSettings(ctx());
    await svc.saveOutreachSettings(ctx(), { ...s, batchLimit: 2 });
    fetchImpl.mockImplementation(async () => okResponse(`re_${Math.random()}`));
    const r = await svc.sendApprovedBatch(ctx());
    expect(r.results).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("records network errors during sending as delivery failures", async () => {
    const p = await realCandidate();
    const m = await approvedDraft(p.id);
    await enableLiveSending();
    const ctxCrash = ctx();
    // Simulate a sender that throws after the claim (process crash / unexpected error).
    ctxCrash.recruitment!.fetchImpl = (async () => {
      throw Object.assign(new Error("boom"), { name: "Unexpected" });
    }) as never;
    const r = await svc.sendApprovedBatch(ctxCrash);
    // ResendSender converts network errors to a recorded failure.
    expect(r.results[0].outcome).toBe("failed");
    expect((await store.getOutreachMessage(m.id))!.status).toBe("failed");
  });
});

describe("suppression and unsubscribe", () => {
  it("a suppression added after approval stops the send", async () => {
    const p = await realCandidate();
    const m = await approvedDraft(p.id);
    await enableLiveSending();
    await svc.addSuppression(ctx(), "ADA@university.edu", "Asked by phone");
    const r = await svc.sendApprovedBatch(ctx());
    expect(r.results).toHaveLength(0); // the approved draft was cancelled when the address was suppressed
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await store.getOutreachMessage(m.id))!.status).toBe("cancelled");
    await expect(svc.createDraft(ctx(), p.id)).rejects.toThrow(/do-not-contact/);
  });

  it("is re-checked at send time even if the message is still approved", async () => {
    const p = await realCandidate();
    const m = await approvedDraft(p.id);
    await enableLiveSending();
    await store.addSuppression({ email: p.email!, reason: "admin", note: null, createdBy: null }); // direct, bypassing cascade
    const r = await svc.sendApprovedBatch(ctx());
    expect(r.results[0].outcome).toBe("skipped");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await store.getOutreachMessage(m.id))!.status).toBe("cancelled");
  });

  it("unsubscribe links add the address to the list and cancel drafts, revealing nothing", async () => {
    const m = await approvedDraft(BEATRICE);
    expect(await svc.unsubscribe(store, "not-a-real-token-but-long-enough")).toBe(false);
    expect(await svc.unsubscribe(store, m.unsubscribeToken)).toBe(true);
    expect(await store.isSuppressed("beatrice.santoro@uis-demo.example")).toBe(true);
    expect((await store.getProspect(BEATRICE))!.doNotContact).toBe(true);
    expect((await store.getOutreachMessage(m.id))!.status).toBe("cancelled");
    expect(await svc.unsubscribe(store, m.unsubscribeToken)).toBe(true); // idempotent
    expect((await store.listSuppressions()).length).toBe(1);
  });

  it("bounces are recorded as delivery failures, not replies", async () => {
    const p = await realCandidate();
    const m = await approvedDraft(p.id);
    await enableLiveSending();
    await svc.sendApprovedBatch(ctx());
    expect(await store.recordDeliveryFailure("re_msg_1", "bounced", "Mailbox does not exist")).toBe(true);
    expect((await store.getOutreachMessage(m.id))!).toMatchObject({ status: "bounced" });
    expect((await store.getProspect(p.id))!.status).toBe("invited"); // unchanged: no reply inferred
    expect(await store.isSuppressed(p.email!)).toBe(true);
  });
});

describe("from prospect to approved mentor", () => {
  it("joining links the account but lists nobody until profile, consent and UIS approval", async () => {
    const p = await realCandidate("newmentor@university.edu", "Nora Mentor");
    const m = await approvedDraft(p.id);
    await enableLiveSending();
    await svc.sendApprovedBatch(ctx());

    // The invitee signs up (demo account creation never accepts a role).
    const account = await store.createAccount({ fullName: "Nora Mentor", email: "newmentor@university.edu" });
    expect(account.role).toBe("member");
    const asNora: ServiceContext = { ...ctx(), actor: { userId: account.id, email: account.email, fullName: account.fullName, role: "member" } };

    // A draft's token (never sent) can't be claimed; the sent one can.
    expect(await svc.claimInvitation(asNora, "z".repeat(32))).toBe(false);
    expect(await svc.claimInvitation(asNora, m.inviteToken)).toBe(true);
    expect(await store.getProspect(p.id)).toMatchObject({ status: "joined", joinedUserId: account.id });

    // Another user can't hijack the same invitation.
    const other = await store.createAccount({ fullName: "Mallory", email: "mallory@university.edu" });
    expect(await svc.claimInvitation({ ...asNora, actor: { userId: other.id, email: other.email, fullName: "Mallory", role: "member" } }, m.inviteToken)).toBe(false);

    // Joined ≠ mentor: no profile, no requests, not in any student's matches.
    expect(await store.getProviderProfile(account.id)).toBeNull();
    expect((await store.listRequests()).filter((r) => r.providerId === account.id)).toEqual([]);
    const lucaMatches = async () => (await svc.getStudentDashboard(ctx(DEMO_IDS.luca)))!.result.matches.map((x) => x.provider.userId);
    expect(await lucaMatches()).not.toContain(account.id);

    // Profile with consent → pending review → still not listed.
    const elena = (await store.getProviderProfile(DEMO_IDS.elena))!;
    await svc.saveProviderProfile(asNora, { ...elena, fullName: "Nora Mentor", linkedinUrl: null, directoryConsent: true } as never);
    expect((await store.getProviderProfile(account.id))!.reviewStatus).toBe("pending");
    expect(await lucaMatches()).not.toContain(account.id);

    // Only UIS approval lists them; still no match or request is created automatically.
    await svc.reviewProvider(ctx(), account.id, "approved", null);
    expect(await lucaMatches()).toContain(account.id);
    expect((await store.listRequests()).filter((r) => r.providerId === account.id)).toEqual([]);
  });

  it("a mentor who doesn't agree to be listed stays hidden even after approval", async () => {
    const account = await store.createAccount({ fullName: "Quiet Mentor", email: "quiet@university.edu" });
    const asQuiet: ServiceContext = { ...ctx(), actor: { userId: account.id, email: account.email, fullName: account.fullName, role: "member" } };
    const elena = (await store.getProviderProfile(DEMO_IDS.elena))!;
    await svc.saveProviderProfile(asQuiet, { ...elena, fullName: "Quiet Mentor", linkedinUrl: null, directoryConsent: false } as never);
    await svc.reviewProvider(ctx(), account.id, "approved", null);
    const matches = (await svc.getStudentDashboard(ctx(DEMO_IDS.luca)))!.result.matches.map((x) => x.provider.userId);
    expect(matches).not.toContain(account.id);
  });

  it("admins can link a candidate who signed up without the link, by email only", async () => {
    const p = await realCandidate("walkin@university.edu", "Walk In");
    await expect(svc.linkCandidateAccount(ctx(), p.id)).rejects.toMatchObject({ code: "not_found" });
    await store.createAccount({ fullName: "Walk In", email: "walkin@university.edu" });
    expect((await svc.linkCandidateAccount(ctx(), p.id)).status).toBe("joined");
    await expect(svc.setCandidateStatus(ctx(), BEATRICE, "joined")).rejects.toMatchObject({ code: "validation" });
  });
});
