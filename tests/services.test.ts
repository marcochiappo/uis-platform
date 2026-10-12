import { beforeEach, describe, expect, it, vi } from "vitest";
import { DemoStore } from "@/lib/data/demo-store";
import { DEMO_IDS, seedAccounts } from "@/lib/data/seed";
import type { Actor } from "@/lib/domain/types";
import { signupSchema } from "@/lib/domain/validation";
import { createMailer } from "@/lib/email";
import * as svc from "@/lib/services";
import type { ServiceContext } from "@/lib/services";
import { WINTER } from "./fixtures";

let store: DemoStore;

function actor(id: string): Actor {
  const a = seedAccounts.find((x) => x.id === id)!;
  return { userId: a.id, email: a.email, fullName: a.fullName, role: a.role };
}

function ctx(id: string | null): ServiceContext {
  return {
    store,
    actor: id ? actor(id) : null,
    mailer: createMailer({ demo: true, store }),
    now: () => WINTER,
  };
}

beforeEach(() => {
  store = new DemoStore(); // fresh in-memory copy of the fictional seed
});

describe("authentication and admin access", () => {
  it("rejects anonymous callers", async () => {
    await expect(svc.getStudentDashboard(ctx(null))).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(svc.adminOverview(ctx(null))).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it.each([
    ["adminOverview", (c: ServiceContext) => svc.adminOverview(c)],
    ["adminListRequests", (c: ServiceContext) => svc.adminListRequests(c)],
    ["adminListProviders", (c: ServiceContext) => svc.adminListProviders(c)],
    ["adminListProspects", (c: ServiceContext) => svc.adminListProspects(c)],
    ["importProspectsCsv", (c: ServiceContext) => svc.importProspectsCsv(c, "full_name\nEve")],
    ["reviewProvider", (c: ServiceContext) => svc.reviewProvider(c, DEMO_IDS.valentina, "approved", null)],
    ["adminListEmails", (c: ServiceContext) => svc.adminListEmails(c)],
  ])("%s is forbidden to non-admin members", async (_, fn) => {
    for (const id of [DEMO_IDS.luca, DEMO_IDS.marco]) await expect(fn(ctx(id))).rejects.toMatchObject({ code: "forbidden" });
  });

  it("public sign-up cannot create an admin", async () => {
    const parsed = signupSchema.parse({ fullName: "Mallory", email: "m@x.example", password: "longenough1", role: "admin" });
    expect(parsed).not.toHaveProperty("role");
    const account = await store.createAccount({ ...parsed, role: "admin" } as never);
    expect(account.role).toBe("member");
  });
});

describe("student dashboard", () => {
  it("only offers approved, listed, available mentors", async () => {
    const data = await svc.getStudentDashboard(ctx(DEMO_IDS.sofia));
    const ids = data!.result.matches.map((m) => m.provider.userId);
    expect(ids).toContain(DEMO_IDS.marco);
    expect(ids).not.toContain(DEMO_IDS.paolo); // paused
    expect(ids).not.toContain(DEMO_IDS.valentina); // pending review
  });

  it("never exposes contact details in what students receive", async () => {
    const data = await svc.getStudentDashboard(ctx(DEMO_IDS.luca));
    const json = JSON.stringify(data);
    expect(json).not.toMatch(/@uis-demo\.example/);
    expect(json).not.toMatch(/linkedin/i);
  });

  it("does not list recruited prospects as mentors", async () => {
    await svc.importProspectsCsv(ctx(DEMO_IDS.admin), "full_name,email,expertise\nPat Prospect,pat@x.example,Calculus tutor");
    const all = await store.listProspects();
    const data = await svc.getStudentDashboard(ctx(DEMO_IDS.luca));
    const matchIds = data!.result.matches.map((m) => m.provider.userId);
    for (const p of all) expect(matchIds).not.toContain(p.id);
    expect(JSON.stringify(data)).not.toContain("Pat Prospect");
  });
});

describe("requesting an introduction", () => {
  it("creates a pending request with a server-computed score", async () => {
    const r = await svc.requestIntroduction(ctx(DEMO_IDS.luca), { providerId: DEMO_IDS.elena, service: "tutoring", message: "Hi" });
    expect(r.status).toBe("pending");
    expect(r.matchScore).toBeGreaterThan(0);
    expect(r.matchReasons[0]).toMatch(/Calculus/);
  });

  it("refuses an incompatible pairing even if the client asks for it", async () => {
    // Luca seeks tutoring in calculus/physics; Andrea tutors chemistry.
    await expect(
      svc.requestIntroduction(ctx(DEMO_IDS.luca), { providerId: DEMO_IDS.andrea, service: "tutoring", message: "" }),
    ).rejects.toMatchObject({ code: "validation" });
    // Luca doesn't seek mentoring at all.
    await expect(
      svc.requestIntroduction(ctx(DEMO_IDS.luca), { providerId: DEMO_IDS.elena, service: "mentoring", message: "" }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("refuses unapproved, hidden and paused providers", async () => {
    for (const id of [DEMO_IDS.valentina, DEMO_IDS.roberto, DEMO_IDS.paolo])
      await expect(
        svc.requestIntroduction(ctx(DEMO_IDS.sofia), { providerId: id, service: "mentoring", message: "" }),
      ).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("refuses requests to yourself", async () => {
    await expect(
      svc.requestIntroduction(ctx(DEMO_IDS.matteo), { providerId: DEMO_IDS.matteo, service: "tutoring", message: "" }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("prevents duplicate open requests for the same service", async () => {
    await expect(
      svc.requestIntroduction(ctx(DEMO_IDS.sofia), { providerId: DEMO_IDS.marco, service: "mentoring", message: "again" }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("requires a student profile", async () => {
    await expect(
      svc.requestIntroduction(ctx(DEMO_IDS.elena), { providerId: DEMO_IDS.francesca, service: "tutoring", message: "" }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("request lifecycle permissions", () => {
  const sofiaToMarco = "00000000-0000-4000-8000-000000000102"; // pending
  const matteoToFrancesca = "00000000-0000-4000-8000-000000000103"; // accepted

  it("lets the mentor accept, then UIS introduce, then the mentor complete", async () => {
    await svc.respondToRequest(ctx(DEMO_IDS.marco), sofiaToMarco, true);
    expect((await store.getProviderProfile(DEMO_IDS.marco))!.activeCount).toBe(2);
    const r = await svc.transitionRequest(ctx(DEMO_IDS.admin), sofiaToMarco, "introduced");
    expect(r.status).toBe("introduced");
    expect(r.introducedAt).not.toBeNull();
    await svc.transitionRequest(ctx(DEMO_IDS.marco), sofiaToMarco, "completed");
    expect((await store.getProviderProfile(DEMO_IDS.marco))!.activeCount).toBe(1);
    const events = await store.listRequestEvents(sofiaToMarco);
    expect(events.map((e) => e.toStatus)).toEqual(["pending", "accepted", "introduced", "completed"]);
  });

  it("does not let a student accept their own request", async () => {
    await expect(svc.respondToRequest(ctx(DEMO_IDS.sofia), sofiaToMarco, true)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("does not let a mentor confirm their own introduction", async () => {
    await expect(svc.transitionRequest(ctx(DEMO_IDS.francesca), matteoToFrancesca, "introduced")).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("hides other people's requests entirely", async () => {
    // Luca is unrelated to Sofia's request: same error as a missing id.
    await expect(svc.withdrawRequest(ctx(DEMO_IDS.luca), sofiaToMarco)).rejects.toMatchObject({ code: "not_found" });
    await expect(svc.respondToRequest(ctx(DEMO_IDS.elena), sofiaToMarco, true)).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects transitions out of terminal states", async () => {
    await svc.respondToRequest(ctx(DEMO_IDS.marco), sofiaToMarco, false);
    await expect(svc.respondToRequest(ctx(DEMO_IDS.marco), sofiaToMarco, true)).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("enforces the mentor's maximum active mentees on accept", async () => {
    await store.saveProviderProfile(DEMO_IDS.marco, { ...(await store.getProviderProfile(DEMO_IDS.marco))!, maxActiveMentees: 1 });
    await expect(svc.respondToRequest(ctx(DEMO_IDS.marco), sofiaToMarco, true)).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("shows the mentor a student summary without contact details", async () => {
    const data = await svc.getProviderDashboard(ctx(DEMO_IDS.marco));
    const sofia = data!.requests.find((v) => v.request.id === sofiaToMarco)!.student!;
    expect(sofia.fullName).toBe("Sofia Greco");
    expect(JSON.stringify(data)).not.toMatch(/@uis-demo\.example/);
  });
});

describe("profiles", () => {
  it("new mentor profiles start pending review and can't approve themselves", async () => {
    const base = (await store.getProviderProfile(DEMO_IDS.elena))!;
    const created = await svc.saveProviderProfile(ctx(DEMO_IDS.luca), {
      ...base,
      fullName: "Luca Marino",
      linkedinUrl: null,
      reviewStatus: "approved",
    } as never);
    expect(created.reviewStatus).toBe("pending");
  });

  it("re-submitting a rejected profile puts it back in the queue", async () => {
    await svc.reviewProvider(ctx(DEMO_IDS.admin), DEMO_IDS.valentina, "rejected", "Please add more detail.");
    const p = (await store.getProviderProfile(DEMO_IDS.valentina))!;
    expect(p.reviewStatus).toBe("rejected");
    const saved = await svc.saveProviderProfile(ctx(DEMO_IDS.valentina), { ...p, linkedinUrl: null } as never);
    expect(saved.reviewStatus).toBe("pending");
  });

  it("pausing removes a mentor from matches", async () => {
    await svc.setMyAvailabilityPaused(ctx(DEMO_IDS.elena), true);
    const data = await svc.getStudentDashboard(ctx(DEMO_IDS.luca));
    expect(data!.result.matches.map((m) => m.provider.userId)).not.toContain(DEMO_IDS.elena);
  });
});

describe("email in demo mode", () => {
  it("never calls an external service and records the message as suppressed", async () => {
    const fetchImpl = vi.fn();
    const mailer = createMailer({ demo: true, store, apiKey: "re_live_key", from: "uis@example.org", fetchImpl });
    await expect(mailer({ to: ["a@x.example"], subject: "Hi", body: "Body" })).resolves.toBe("suppressed_demo");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await store.listEmails())[0]).toMatchObject({ subject: "Hi", delivery: "suppressed_demo" });
  });

  it("confirming an introduction queues the email locally only", async () => {
    await svc.transitionRequest(ctx(DEMO_IDS.admin), "00000000-0000-4000-8000-000000000103", "introduced");
    const [email] = await store.listEmails();
    expect(email.delivery).toBe("suppressed_demo");
    expect(email.to).toEqual([`matteo@uis-demo.example`, `francesca@uis-demo.example`]);
  });

  it("reports not_configured outside demo mode without keys", async () => {
    const fetchImpl = vi.fn();
    const mailer = createMailer({ demo: false, store, fetchImpl });
    await expect(mailer({ to: ["a@x.example"], subject: "s", body: "b" })).resolves.toBe("not_configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("prospect import", () => {
  it("imports valid rows, skips duplicates and reports bad lines", async () => {
    const csv = [
      "Name,Email,Company,Expertise,LinkedIn,Notes",
      "Ada Example,ada@x.example,Acme,Maths,https://linkedin.com/in/ada,Met at fair",
      "Ada Again,ADA@x.example,,,,",
      ",nobody@x.example,,,,",
      "Bad Email,not-an-email,,,,",
      "Lorenzo Fontana,lorenzo.fontana@uis-demo.example,,,,",
    ].join("\n");
    const res = await svc.importProspectsCsv(ctx(DEMO_IDS.admin), csv);
    expect(res.inserted).toBe(1);
    expect(res.duplicates).toBe(1); // already in the seed
    expect(res.errors.map((e) => e.line)).toEqual([3, 4, 5]);
  });
});
