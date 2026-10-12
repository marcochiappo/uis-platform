import { describe, expect, it } from "vitest";
import { evaluate, findMatches, WEIGHTS } from "@/lib/domain/matching";
import { scheduleOverlap } from "@/lib/domain/schedule";
import { seedProviders, seedStudents, DEMO_IDS } from "@/lib/data/seed";
import { formatReason } from "@/lib/i18n";
import { provider, student, WINTER } from "./fixtures";

describe("tutoring hard requirements", () => {
  it("matches when subject, level and language all line up", () => {
    const r = findMatches(student(), [provider()], WINTER);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].service).toBe("tutoring");
  });

  it("requires a shared subject", () => {
    const r = findMatches(student({ subjects: ["physics"] }), [provider()], WINTER);
    expect(r.matches).toHaveLength(0);
    expect(r.excluded.tutoring.no_subject_overlap).toBe(1);
  });

  it("requires the provider to teach the student's level", () => {
    const r = findMatches(student({ degreeLevel: "graduate" }), [provider()], WINTER);
    expect(r.matches).toHaveLength(0);
    expect(r.excluded.tutoring.level_not_taught).toBe(1);
  });

  it("requires a shared language", () => {
    const r = findMatches(student({ preferredLanguage: "en", languages: [] }), [provider({ languages: ["it"] })], WINTER);
    expect(r.matches).toHaveLength(0);
    expect(r.excluded.tutoring.no_shared_language).toBe(1);
  });

  it("does not offer tutoring from a mentoring-only provider", () => {
    const r = findMatches(student(), [provider({ offersTutoring: false, offersMentoring: true })], WINTER);
    expect(r.matches).toHaveLength(0);
    expect(r.excluded.tutoring.service_not_offered).toBe(1);
  });
});

describe("mentoring requirements and priorities", () => {
  const mentee = student({ seeking: "mentoring", subjects: [], goals: ["internships", "networking"], careerAreas: ["finance"] });
  const mentor = (over = {}) =>
    provider({ offersTutoring: false, offersMentoring: true, tutoringSubjects: [], teachingLevels: [], ...over });

  it("requires at least one shared goal or career area", () => {
    const r = findMatches(mentee, [mentor({ mentoringTopics: ["study_skills"], careerAreas: ["law"] })], WINTER);
    expect(r.matches).toHaveLength(0);
    expect(r.excluded.mentoring.no_goal_or_career_overlap).toBe(1);
  });

  it("ranks the mentor with more relevant goals and experience higher", () => {
    const strong = mentor({ userId: "strong", fullName: "Strong", mentoringTopics: ["internships", "networking"], careerAreas: ["finance"] });
    const weak = mentor({ userId: "weak", fullName: "Weak", mentoringTopics: ["internships"], careerAreas: [] });
    const r = findMatches(mentee, [weak, strong], WINTER);
    expect(r.matches.map((x) => x.provider.userId)).toEqual(["strong", "weak"]);
    const goals = r.matches[0].reasons.find((x) => x.factor === "goals")!;
    expect(goals.points).toBe(WEIGHTS.mentoring.goals);
  });
});

describe("availability of the provider", () => {
  it.each([
    ["not approved", { reviewStatus: "pending" as const }],
    ["rejected", { reviewStatus: "rejected" as const }],
    ["without directory consent", { directoryConsent: false }],
  ])("never returns a provider that is %s, and doesn't count them", (_, over) => {
    const r = findMatches(student(), [provider(over)], WINTER);
    expect(r.matches).toHaveLength(0);
    expect(r.excluded.tutoring).toEqual({});
  });

  it("excludes paused and full providers as unavailable", () => {
    const r = findMatches(student(), [provider({ isPaused: true }), provider({ userId: "full", activeCount: 2, maxActiveMentees: 2 })], WINTER);
    expect(r.matches).toHaveLength(0);
    expect(r.excluded.tutoring.unavailable).toBe(2);
  });

  it("never matches a person with themselves", () => {
    const r = findMatches(student({ userId: "same" }), [provider({ userId: "same" })], WINTER);
    expect(r.matches).toHaveLength(0);
  });

  it("rewards remaining capacity", () => {
    const empty = evaluate(student(), provider({ activeCount: 0 }), "tutoring", WINTER);
    const half = evaluate(student(), provider({ activeCount: 1 }), "tutoring", WINTER);
    expect(empty.ok && half.ok).toBe(true);
    if (empty.ok && half.ok) expect(empty.match.score).toBeGreaterThan(half.match.score);
  });
});

describe("transparent score", () => {
  it("is exactly the sum of the explained points and within 0–100", () => {
    const s = student({ seeking: "both", goals: ["internships"], careerAreas: ["technology"], subjects: ["calculus", "physics"] });
    const p = provider({ offersMentoring: true, mentoringTopics: ["internships"], careerAreas: ["technology"] });
    const r = findMatches(s, [p], WINTER);
    expect(r.matches).toHaveLength(2);
    for (const match of r.matches) {
      expect(match.score).toBe(match.reasons.reduce((a, x) => a + x.points, 0));
      expect(match.score).toBeGreaterThanOrEqual(0);
      expect(match.score).toBeLessThanOrEqual(100);
      for (const reason of match.reasons) expect(reason.points).toBeLessThanOrEqual(reason.max);
    }
  });

  it("explains using the real profile values", () => {
    const ev = evaluate(student({ subjects: ["calculus", "physics"] }), provider({ tutoringSubjects: ["calculus"] }), "tutoring", WINTER);
    if (!ev.ok) throw new Error("expected match");
    const text = ev.match.reasons.map((r) => formatReason(r));
    expect(text[0]).toBe("Tutors Calculus — 1 of the 2 subjects you asked for.");
    expect(text).toContain("Teaches at your level (Undergraduate).");
    expect(text).toContain("Speaks Italian, your preferred language.");
    expect(text).toContain("2 of 2 mentee spots open.");
  });

  it("scores schedule only from genuine overlap", () => {
    const ev = evaluate(student({ availability: ["sat-morning"] }), provider({ availability: ["mon-evening"] }), "tutoring", WINTER);
    if (!ev.ok) throw new Error("expected match");
    const sched = ev.match.reasons.find((r) => r.factor === "schedule")!;
    expect(sched.points).toBe(0);
    expect(formatReason(sched)).toMatch(/No overlapping availability/);
  });
});

describe("time zones", () => {
  it("converts between zones before comparing", () => {
    // Rome evening 17–21 (UTC+1 in winter) = 16–20 UTC; New York afternoon 12–17 (UTC-5) = 17–22 UTC.
    const o = scheduleOverlap(
      { slots: ["mon-evening"], timeZone: "Europe/Rome" },
      { slots: ["mon-afternoon"], timeZone: "America/New_York" },
      WINTER,
    );
    expect(o.hours).toBe(3);
    expect(o.overlappingSlots).toEqual(["mon-evening"]);
  });

  it("finds no overlap when same local slot is far apart in UTC", () => {
    const o = scheduleOverlap(
      { slots: ["mon-morning"], timeZone: "Asia/Tokyo" },
      { slots: ["mon-morning"], timeZone: "America/Los_Angeles" },
      WINTER,
    );
    expect(o.hours).toBe(0);
  });
});

describe("demo dataset scenarios", () => {
  const providers = seedProviders;
  const get = (id: string) => seedStudents.find((s) => s.userId === id)!;

  it("gives Giulia an honest empty state (tutor exists, but not at graduate level)", () => {
    const r = findMatches(get(DEMO_IDS.giulia), providers, WINTER);
    expect(r.matches).toHaveLength(0);
    expect(r.excluded.tutoring.level_not_taught).toBe(1);
  });

  it("never shows pending, hidden or paused demo mentors", () => {
    for (const s of seedStudents) {
      const ids = findMatches(s, providers, WINTER).matches.map((m) => m.provider.userId);
      expect(ids).not.toContain(DEMO_IDS.valentina);
      expect(ids).not.toContain(DEMO_IDS.roberto);
      expect(ids).not.toContain(DEMO_IDS.paolo);
    }
  });

  it("does not match Matteo with his own tutor profile", () => {
    const ids = findMatches(get(DEMO_IDS.matteo), providers, WINTER).matches.map((m) => m.provider.userId);
    expect(ids).not.toContain(DEMO_IDS.matteo);
    expect(ids).toContain(DEMO_IDS.francesca);
  });
});
