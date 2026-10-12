import { beforeAll, describe, expect, it } from "vitest";
import { DEMO_IDS } from "@/lib/data/seed";
import { as, createTestDb, createUser, type TestDb } from "./harness";

/**
 * Runs supabase/migrations + supabase/seed.sql in PGlite and checks the
 * database itself enforces permissions, independent of the Next.js app.
 */
let db: TestDb;
const SOFIA_TO_MARCO = "00000000-0000-4000-8000-000000000102"; // pending
const MATTEO_TO_FRANCESCA = "00000000-0000-4000-8000-000000000103"; // accepted

async function rows<T = Record<string, unknown>>(userId: string | null, sql: string, params: unknown[] = []) {
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

beforeAll(async () => {
  db = await createTestDb({ seed: true });
}, 60_000);

describe("sign-up and roles", () => {
  it("creates a member profile and ignores a role in sign-up metadata", async () => {
    const id = "00000000-0000-4000-8000-00000000a001";
    await createUser(db, id, "mallory@x.example", { full_name: "Mallory", role: "admin" });
    const [p] = await rows<{ role: string; full_name: string }>(id, "select role, full_name from public.profiles where id = $1", [id]);
    expect(p).toEqual({ role: "member", full_name: "Mallory" });
  });

  it("does not let members promote themselves", async () => {
    const err = await fails(DEMO_IDS.luca, "update public.profiles set role = 'admin' where id = $1", [DEMO_IDS.luca]);
    expect(err).toMatch(/permission denied|administrators/);
    const [p] = await rows<{ role: string }>(DEMO_IDS.luca, "select role from public.profiles where id = $1", [DEMO_IDS.luca]);
    expect(p.role).toBe("member");
  });

  it("lets members edit their own name", async () => {
    await rows(DEMO_IDS.luca, "update public.profiles set full_name = 'Luca M.' where id = $1", [DEMO_IDS.luca]);
    const [p] = await rows<{ full_name: string }>(DEMO_IDS.luca, "select full_name from public.profiles where id = $1", [DEMO_IDS.luca]);
    expect(p.full_name).toBe("Luca M.");
  });
});

describe("private records", () => {
  it("gives anonymous users nothing", async () => {
    for (const t of ["profiles", "student_profiles", "provider_profiles", "intro_requests", "prospects"])
      expect(await fails(null, `select * from public.${t}`)).toMatch(/permission denied/);
  });

  it("shows members only their own private profile (email, LinkedIn)", async () => {
    const visible = await rows<{ id: string }>(DEMO_IDS.luca, "select id from public.profiles");
    expect(visible.map((r) => r.id)).toEqual([DEMO_IDS.luca]);
  });

  it("lets admins read all private profiles", async () => {
    const visible = await rows(DEMO_IDS.admin, "select id from public.profiles");
    expect(visible.length).toBeGreaterThan(10);
  });

  it("hides student profiles from unrelated users", async () => {
    const seen = await rows<{ user_id: string }>(DEMO_IDS.luca, "select user_id from public.student_profiles");
    expect(seen.map((r) => r.user_id)).toEqual([DEMO_IDS.luca]);
  });

  it("lets a mentor see only the students who contacted them", async () => {
    const seen = await rows<{ user_id: string }>(DEMO_IDS.marco, "select user_id from public.student_profiles order by user_id");
    expect(seen.map((r) => r.user_id).sort()).toEqual([DEMO_IDS.sofia, DEMO_IDS.anna].sort());
  });

  it("only shows requests to the people involved", async () => {
    const luca = await rows(DEMO_IDS.luca, "select id from public.intro_requests");
    expect(luca).toEqual([]);
    const sofia = await rows<{ id: string }>(DEMO_IDS.sofia, "select id from public.intro_requests");
    expect(sofia.map((r) => r.id)).toEqual([SOFIA_TO_MARCO]);
  });

  it("does not let users read or write someone else's student profile", async () => {
    await rows(DEMO_IDS.luca, "update public.student_profiles set university = 'hacked' where user_id = $1", [DEMO_IDS.sofia]);
    const [s] = await rows<{ university: string }>(DEMO_IDS.admin, "select university from public.student_profiles where user_id = $1", [DEMO_IDS.sofia]);
    expect(s.university).not.toBe("hacked");
  });
});

describe("directory visibility", () => {
  it("shows students approved, consenting providers only (plus ones they already contacted)", async () => {
    const seen = (await rows<{ user_id: string }>(DEMO_IDS.luca, "select user_id from public.provider_profiles")).map((r) => r.user_id);
    expect(seen).toContain(DEMO_IDS.elena);
    expect(seen).not.toContain(DEMO_IDS.valentina); // pending review
    expect(seen).not.toContain(DEMO_IDS.roberto); // no directory consent
  });

  it("keeps prospects admin-only", async () => {
    expect(await rows(DEMO_IDS.luca, "select * from public.prospects")).toEqual([]);
    expect(await fails(DEMO_IDS.luca, "insert into public.prospects (full_name) values ('x')")).toMatch(/row-level security/);
    expect((await rows(DEMO_IDS.admin, "select * from public.prospects")).length).toBe(4);
  });
});

describe("provider review fields are server-controlled", () => {
  it("forces new provider profiles to pending even if the client says approved", async () => {
    await rows(
      DEMO_IDS.luca,
      `insert into public.provider_profiles (user_id, full_name, bio, offers_tutoring, tutoring_subjects, teaching_levels, languages, time_zone, availability, review_status, active_count, is_demo)
       values ($1, 'Luca', 'bio', true, '{calculus}', '{high_school}', '{it}', 'Europe/Rome', '{mon-evening}', 'approved', -5, true)`,
      [DEMO_IDS.luca],
    );
    const [p] = await rows<{ review_status: string; active_count: number; is_demo: boolean }>(
      DEMO_IDS.luca,
      "select review_status, active_count, is_demo from public.provider_profiles where user_id = $1",
      [DEMO_IDS.luca],
    );
    expect(p).toEqual({ review_status: "pending", active_count: 0, is_demo: false });
  });

  it("ignores attempts to self-approve on update", async () => {
    await rows(DEMO_IDS.valentina, "update public.provider_profiles set review_status = 'approved' where user_id = $1", [DEMO_IDS.valentina]);
    const [p] = await rows<{ review_status: string }>(DEMO_IDS.admin, "select review_status from public.provider_profiles where user_id = $1", [DEMO_IDS.valentina]);
    expect(p.review_status).toBe("pending");
  });

  it("lets an admin approve and records who did it", async () => {
    await rows(DEMO_IDS.admin, "update public.provider_profiles set review_status = 'approved' where user_id = $1", [DEMO_IDS.valentina]);
    const [p] = await rows<{ review_status: string; reviewed_by: string }>(
      DEMO_IDS.admin,
      "select review_status, reviewed_by from public.provider_profiles where user_id = $1",
      [DEMO_IDS.valentina],
    );
    expect(p).toEqual({ review_status: "approved", reviewed_by: DEMO_IDS.admin });
  });
});

describe("introduction requests", () => {
  const create = (uid: string, provider: string, service: string) =>
    fails(uid, "select * from public.create_intro_request($1, $2::public.service_type, 'hi', 50, '{}')", [provider, service]);

  it("cannot be inserted or updated directly", async () => {
    expect(
      await fails(DEMO_IDS.luca, "insert into public.intro_requests (student_id, provider_id, service) values ($1, $2, 'tutoring')", [DEMO_IDS.luca, DEMO_IDS.elena]),
    ).toMatch(/permission denied/);
    expect(await fails(DEMO_IDS.marco, "update public.intro_requests set status = 'introduced' where id = $1", [SOFIA_TO_MARCO])).toMatch(
      /permission denied/,
    );
  });

  it("are created through the RPC when the hard requirements hold", async () => {
    expect(await create(DEMO_IDS.luca, DEMO_IDS.elena, "tutoring")).toBeNull();
    const mine = await rows<{ status: string }>(DEMO_IDS.luca, "select status from public.intro_requests where provider_id = $1", [DEMO_IDS.elena]);
    expect(mine).toEqual([{ status: "pending" }]);
  });

  it("are refused when the database can't verify compatibility", async () => {
    expect(await create(DEMO_IDS.luca, DEMO_IDS.andrea, "tutoring")).toMatch(/shared subject/); // chemistry vs calculus
    expect(await create(DEMO_IDS.giulia, DEMO_IDS.andrea, "tutoring")).toMatch(/shared subject at your level/); // graduate level
    expect(await create(DEMO_IDS.luca, DEMO_IDS.marco, "mentoring")).toMatch(/does not seek/);
    expect(await create(DEMO_IDS.sofia, DEMO_IDS.paolo, "mentoring")).toMatch(/not accepting/); // paused
    expect(await create(DEMO_IDS.sofia, DEMO_IDS.marco, "mentoring")).toMatch(/duplicate key|unique/); // already open
  });

  it("enforce who may move them between states", async () => {
    const t = (uid: string, id: string, to: string) =>
      fails(uid, "select * from public.transition_request($1, $2::public.request_status)", [id, to]);
    expect(await t(DEMO_IDS.sofia, SOFIA_TO_MARCO, "accepted")).toMatch(/not allowed/);
    expect(await t(DEMO_IDS.luca, SOFIA_TO_MARCO, "withdrawn")).toMatch(/not found/);
    expect(await t(DEMO_IDS.francesca, MATTEO_TO_FRANCESCA, "introduced")).toMatch(/not allowed/);
    expect(await t(DEMO_IDS.admin, MATTEO_TO_FRANCESCA, "introduced")).toBeNull();
    expect(await t(DEMO_IDS.admin, MATTEO_TO_FRANCESCA, "accepted")).toMatch(/not allowed/);
  });

  it("track mentor capacity and block accepting beyond it", async () => {
    const count = async () =>
      (await rows<{ active_count: number }>(DEMO_IDS.admin, "select active_count from public.provider_profiles where user_id = $1", [DEMO_IDS.marco]))[0]
        .active_count;
    expect(await count()).toBe(1); // Anna (introduced)
    await rows(DEMO_IDS.marco, "update public.provider_profiles set max_active_mentees = 1 where user_id = $1", [DEMO_IDS.marco]);
    expect(await fails(DEMO_IDS.marco, "select * from public.transition_request($1, 'accepted')", [SOFIA_TO_MARCO])).toMatch(/capacity/);
    await rows(DEMO_IDS.marco, "update public.provider_profiles set max_active_mentees = 2 where user_id = $1", [DEMO_IDS.marco]);
    expect(await fails(DEMO_IDS.marco, "select * from public.transition_request($1, 'accepted')", [SOFIA_TO_MARCO])).toBeNull();
    expect(await count()).toBe(2);
    const events = await rows<{ from_status: string; to_status: string }>(
      DEMO_IDS.sofia,
      "select from_status, to_status from public.request_events where request_id = $1 order by id",
      [SOFIA_TO_MARCO],
    );
    expect(events.at(-1)).toEqual({ from_status: "pending", to_status: "accepted" });
  });
});
