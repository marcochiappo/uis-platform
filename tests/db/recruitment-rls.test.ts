import { beforeAll, describe, expect, it } from "vitest";
import { DEMO_IDS } from "@/lib/data/seed";
import { as, createTestDb, type TestDb } from "./harness";

/** Database-level guarantees of the recruitment migration, independent of the app. */
let db: TestDb;
const BEATRICE = "00000000-0000-4000-8000-000000000201";
const LORENZO = "00000000-0000-4000-8000-000000000200";
const tok = (s: string) => s.padEnd(32, "x");

async function run<T = Record<string, unknown>>(userId: string | null, sql: string, params: unknown[] = []) {
  return as(db, userId, async (tx) => (await tx.query<T>(sql, params)).rows);
}
async function fails(userId: string | null, sql: string, params: unknown[] = []) {
  return as(db, userId, async (tx) => {
    try {
      await tx.query(sql, params);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  });
}

/** Insert a message as admin and walk it to the given status. */
async function message(prospect: string, recipient: string, status: "draft" | "approved" | "sent", name: string) {
  const [{ id }] = await run<{ id: string }>(
    DEMO_IDS.admin,
    `insert into public.outreach_messages (prospect_id, recipient, subject, body, invite_token, unsubscribe_token)
     values ($1, $2, 'Hi', 'Body {{signup_link}} {{unsubscribe_link}}', $3, $4) returning id`,
    [prospect, recipient, tok(`inv-${name}`), tok(`uns-${name}`)],
  );
  if (status !== "draft")
    await run(DEMO_IDS.admin, "update public.outreach_messages set status = 'approved', approved_by = $2, approved_hash = 'h', approved_recipient = recipient where id = $1", [id, DEMO_IDS.admin]);
  if (status === "sent") {
    await run(DEMO_IDS.admin, "update public.outreach_messages set status = 'sending' where id = $1", [id]);
    await run(DEMO_IDS.admin, "update public.outreach_messages set status = 'sent', provider_message_id = $2 where id = $1", [id, `re_${name}`]);
  }
  return id;
}

beforeAll(async () => {
  db = await createTestDb({ seed: true });
}, 60_000);

describe("access", () => {
  it("keeps recruitment tables admin-only", async () => {
    for (const t of ["outreach_messages", "suppressions", "outreach_settings", "prospects"]) {
      expect(await fails(null, `select * from public.${t}`)).toMatch(/permission denied/);
      expect(await run(DEMO_IDS.luca, `select * from public.${t}`)).toEqual([]);
    }
    expect(await fails(DEMO_IDS.marco, "insert into public.suppressions (email, reason) values ('a@b.org', 'admin')")).toMatch(/row-level security/);
  });

  it("doesn't let users call the webhook-only function", async () => {
    expect(await fails(DEMO_IDS.admin, "select public.record_delivery_failure('x', 'bounced', 'd')")).toMatch(/permission denied/);
    expect(await fails(null, "select public.claim_invitation($1)", [tok("a")])).toMatch(/permission denied/);
  });
});

describe("community relevance", () => {
  it("requires evidence to store a confirmed affiliation", async () => {
    expect(await fails(DEMO_IDS.admin, "update public.prospects set community_affiliation = 'confirmed', affiliation_evidence = null where id = $1", [LORENZO])).toMatch(/prospects_confirmed_needs_evidence/);
  });

  it("can't mark someone joined without a linked account", async () => {
    expect(await fails(DEMO_IDS.admin, "update public.prospects set status = 'joined' where id = $1", [LORENZO])).toMatch(/prospects_joined_needs_account/);
  });
});

describe("send guards", () => {
  it("allows at most one sending/sent invitation per candidate", async () => {
    await message(BEATRICE, "beatrice.santoro@uis-demo.example", "sent", "b1");
    const second = await message(BEATRICE, "beatrice.santoro@uis-demo.example", "approved", "b2");
    expect(await fails(DEMO_IDS.admin, "update public.outreach_messages set status = 'sending' where id = $1", [second])).toMatch(/outreach_one_send_per_prospect/);
  });

  it("revokes approval when approved content is edited, and freezes sent content", async () => {
    const id = await message(LORENZO, "lorenzo.fontana@uis-demo.example", "approved", "l1");
    await run(DEMO_IDS.admin, "update public.outreach_messages set body = body || ' edited' where id = $1", [id]);
    const [row] = await run<{ status: string; approved_hash: string | null }>(DEMO_IDS.admin, "select status, approved_hash from public.outreach_messages where id = $1", [id]);
    expect(row).toEqual({ status: "draft", approved_hash: null });
    const sent = (await run<{ id: string }>(DEMO_IDS.admin, "select id from public.outreach_messages where status = 'sent'"))[0].id;
    expect(await fails(DEMO_IDS.admin, "update public.outreach_messages set body = 'changed' where id = $1", [sent])).toMatch(/cannot be edited/);
  });

  it("refuses to start sending to a suppressed address", async () => {
    await run(DEMO_IDS.admin, "update public.outreach_messages set status = 'cancelled' where prospect_id = $1 and status in ('draft','approved')", [LORENZO]);
    const id = await message(LORENZO, "lorenzo.fontana@uis-demo.example", "approved", "l2");
    await run(DEMO_IDS.admin, "insert into public.suppressions (email, reason) values ('lorenzo.fontana@uis-demo.example', 'admin')");
    expect(await fails(DEMO_IDS.admin, "update public.outreach_messages set status = 'sending' where id = $1", [id])).toMatch(/do-not-contact/);
  });

  it("refuses to send to a recipient other than the approved one", async () => {
    const [{ id: pid }] = await run<{ id: string }>(DEMO_IDS.admin, "insert into public.prospects (full_name, email, review_status) values ('Test Person', 'test.person@university.edu', 'approved') returning id");
    const id = await message(pid, "test.person@university.edu", "approved", "t1");
    await run(DEMO_IDS.admin, "update public.outreach_messages set approved_recipient = 'someone.else@university.edu' where id = $1", [id]);
    expect(await fails(DEMO_IDS.admin, "update public.outreach_messages set status = 'sending' where id = $1", [id])).toMatch(/approved recipient/);
  });
});

describe("public token functions", () => {
  it("lets anyone with the link unsubscribe, without revealing anything", async () => {
    const [{ id: pid }] = await run<{ id: string }>(DEMO_IDS.admin, "insert into public.prospects (full_name, email) values ('Unsub Person', 'unsub@university.edu') returning id");
    const draft = await message(pid, "unsub@university.edu", "draft", "u1");
    expect((await run<{ ok: boolean }>(null, "select public.unsubscribe_by_token($1) as ok", [tok("nope")]))[0].ok).toBe(false);
    expect((await run<{ ok: boolean }>(null, "select public.unsubscribe_by_token($1) as ok", [tok("uns-u1")]))[0].ok).toBe(true);
    const [s] = await run<{ reason: string }>(DEMO_IDS.admin, "select reason from public.suppressions where email = 'unsub@university.edu'");
    expect(s.reason).toBe("unsubscribed");
    const [m] = await run<{ status: string }>(DEMO_IDS.admin, "select status from public.outreach_messages where id = $1", [draft]);
    expect(m.status).toBe("cancelled");
    // Idempotent.
    expect((await run<{ ok: boolean }>(null, "select public.unsubscribe_by_token($1) as ok", [tok("uns-u1")]))[0].ok).toBe(true);
  });

  it("claiming an invitation only links the account — no profile, approval or match", async () => {
    const [{ id: pid }] = await run<{ id: string }>(DEMO_IDS.admin, "insert into public.prospects (full_name, email, review_status) values ('Invitee', 'invitee@university.edu', 'approved') returning id");
    const draftId = await message(pid, "invitee@university.edu", "draft", "d1");
    expect((await run<{ ok: boolean }>(DEMO_IDS.luca, "select public.claim_invitation($1) as ok", [tok("inv-d1")]))[0].ok).toBe(false);
    await run(DEMO_IDS.admin, "update public.outreach_messages set status = 'cancelled' where id = $1", [draftId]);
    await message(pid, "invitee@university.edu", "sent", "s1");
    const before = (await run<{ n: number }>(DEMO_IDS.admin, "select count(*)::int as n from public.provider_profiles"))[0].n;
    expect((await run<{ ok: boolean }>(DEMO_IDS.luca, "select public.claim_invitation($1) as ok", [tok("inv-s1")]))[0].ok).toBe(true);
    const [p] = await run<{ status: string; joined_user_id: string }>(DEMO_IDS.admin, "select status, joined_user_id from public.prospects where id = $1", [pid]);
    expect(p).toEqual({ status: "joined", joined_user_id: DEMO_IDS.luca });
    expect((await run<{ n: number }>(DEMO_IDS.admin, "select count(*)::int as n from public.provider_profiles"))[0].n).toBe(before);
    // A different user can't take over the same invitation.
    expect((await run<{ ok: boolean }>(DEMO_IDS.sofia, "select public.claim_invitation($1) as ok", [tok("inv-s1")]))[0].ok).toBe(false);
  });

  it("records bounces via the service role as failures and suppresses the address", async () => {
    await db.exec("set role service_role;");
    const [{ ok }] = (await db.query<{ ok: boolean }>("select public.record_delivery_failure('re_b1', 'bounced', 'Mailbox full') as ok")).rows;
    await db.exec("reset role;");
    expect(ok).toBe(true);
    const [m] = await run<{ status: string }>(DEMO_IDS.admin, "select status from public.outreach_messages where provider_message_id = 're_b1'");
    expect(m.status).toBe("bounced");
    expect((await run(DEMO_IDS.admin, "select 1 from public.suppressions where email = 'beatrice.santoro@uis-demo.example' and reason = 'bounced'")).length).toBe(1);
  });
});
