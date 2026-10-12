import type {
  AvailabilitySlot,
  CareerArea,
  LanguageCode,
  MentoringGoal,
  ServiceType,
  Subject,
  TeachingLevel,
} from "./options";
import { scheduleOverlap } from "./schedule";
import type { ProviderProfile, StudentProfile } from "./types";

/**
 * Transparent, rules-based matching.
 *
 * A provider is only returned for a service when every hard requirement holds.
 * The score (0–100) is the sum of the points shown in `reasons`, so what the
 * student sees is exactly how the number was produced. Nothing is inferred
 * beyond the fields people entered themselves.
 */

export const WEIGHTS = {
  tutoring: { subjects: 40, level: 15, language: 15, schedule: 20, capacity: 10 },
  mentoring: { goals: 30, career: 25, language: 15, schedule: 20, capacity: 10 },
} as const;

/** Overlapping hours per week that earn full schedule points. */
export const FULL_SCHEDULE_HOURS = 4;
/** Points for sharing a language that isn't the student's preferred one. */
const SHARED_LANGUAGE_POINTS = 8;

export type Reason =
  | { factor: "subjects"; points: number; max: number; matched: Subject[]; requested: number }
  | { factor: "level"; points: number; max: number; level: TeachingLevel }
  | { factor: "goals"; points: number; max: number; matched: MentoringGoal[]; requested: number }
  | {
      factor: "career";
      points: number;
      max: number;
      matched: CareerArea[];
      requested: number;
      yearsExperience: number;
    }
  | {
      factor: "language";
      points: number;
      max: number;
      preferred: boolean;
      languages: LanguageCode[];
    }
  | {
      factor: "schedule";
      points: number;
      max: number;
      hours: number;
      slots: AvailabilitySlot[];
    }
  | { factor: "capacity"; points: number; max: number; remaining: number; capacity: number };

export interface Match {
  provider: ProviderProfile;
  service: ServiceType;
  score: number;
  reasons: Reason[];
}

export type ExclusionCode =
  | "unavailable" // paused or at capacity
  | "service_not_offered"
  | "no_subject_overlap"
  | "level_not_taught"
  | "no_goal_or_career_overlap"
  | "no_shared_language";

export interface MatchResult {
  matches: Match[];
  /** Per service, how many listed providers failed each requirement (first failure counted). */
  excluded: Record<ServiceType, Partial<Record<ExclusionCode, number>>>;
  /** Services the student asked for. */
  services: ServiceType[];
  /** Student-side gaps that make a service impossible to match (e.g. no subjects chosen). */
  missingStudentInfo: Partial<Record<ServiceType, "subjects" | "goals_or_career">>;
}

export function servicesSought(student: Pick<StudentProfile, "seeking">): ServiceType[] {
  return student.seeking === "both" ? ["mentoring", "tutoring"] : [student.seeking];
}

/** Only approved, consenting providers are part of the directory at all. */
export function isListed(p: ProviderProfile): boolean {
  return p.reviewStatus === "approved" && p.directoryConsent;
}

export function remainingCapacity(p: ProviderProfile): number {
  return Math.max(0, p.maxActiveMentees - p.activeCount);
}

export function isAcceptingRequests(p: ProviderProfile): boolean {
  return isListed(p) && !p.isPaused && remainingCapacity(p) > 0;
}

function intersect<T>(a: readonly T[], b: readonly T[]): T[] {
  const set = new Set(b);
  return [...new Set(a)].filter((x) => set.has(x));
}

function studentLanguages(s: StudentProfile): LanguageCode[] {
  return [...new Set([s.preferredLanguage, ...s.languages])];
}

function languageReason(
  s: StudentProfile,
  p: ProviderProfile,
  max: number,
): Reason | null {
  const shared = intersect(studentLanguages(s), p.languages);
  if (shared.length === 0) return null;
  const preferred = p.languages.includes(s.preferredLanguage);
  return {
    factor: "language",
    points: preferred ? max : Math.min(max, SHARED_LANGUAGE_POINTS),
    max,
    preferred,
    languages: preferred ? [s.preferredLanguage] : shared,
  };
}

function scheduleReason(s: StudentProfile, p: ProviderProfile, max: number, at: Date): Reason {
  const overlap = scheduleOverlap(
    { slots: s.availability, timeZone: s.timeZone },
    { slots: p.availability, timeZone: p.timeZone },
    at,
  );
  return {
    factor: "schedule",
    points: Math.round(Math.min(overlap.hours / FULL_SCHEDULE_HOURS, 1) * max),
    max,
    hours: overlap.hours,
    slots: overlap.overlappingSlots,
  };
}

function capacityReason(p: ProviderProfile, max: number): Reason {
  const remaining = remainingCapacity(p);
  return {
    factor: "capacity",
    points: Math.round((remaining / p.maxActiveMentees) * max),
    max,
    remaining,
    capacity: p.maxActiveMentees,
  };
}

type Evaluation = { ok: true; match: Match } | { ok: false; code: ExclusionCode };

export function evaluate(
  student: StudentProfile,
  provider: ProviderProfile,
  service: ServiceType,
  at: Date = new Date(),
): Evaluation {
  if (provider.isPaused || remainingCapacity(provider) === 0) return { ok: false, code: "unavailable" };

  if (service === "tutoring") {
    const w = WEIGHTS.tutoring;
    if (!provider.offersTutoring) return { ok: false, code: "service_not_offered" };
    const subjects = intersect(student.subjects, provider.tutoringSubjects);
    if (subjects.length === 0) return { ok: false, code: "no_subject_overlap" };
    if (!provider.teachingLevels.includes(student.degreeLevel))
      return { ok: false, code: "level_not_taught" };
    const language = languageReason(student, provider, w.language);
    if (!language) return { ok: false, code: "no_shared_language" };
    const reasons: Reason[] = [
      {
        factor: "subjects",
        points: Math.round((subjects.length / new Set(student.subjects).size) * w.subjects),
        max: w.subjects,
        matched: subjects,
        requested: new Set(student.subjects).size,
      },
      { factor: "level", points: w.level, max: w.level, level: student.degreeLevel },
      language,
      scheduleReason(student, provider, w.schedule, at),
      capacityReason(provider, w.capacity),
    ];
    return { ok: true, match: build(provider, service, reasons) };
  }

  const w = WEIGHTS.mentoring;
  if (!provider.offersMentoring) return { ok: false, code: "service_not_offered" };
  const goals = intersect(student.goals, provider.mentoringTopics);
  const careers = intersect(student.careerAreas, provider.careerAreas);
  if (goals.length === 0 && careers.length === 0)
    return { ok: false, code: "no_goal_or_career_overlap" };
  const language = languageReason(student, provider, w.language);
  if (!language) return { ok: false, code: "no_shared_language" };
  const goalCount = new Set(student.goals).size;
  const careerCount = new Set(student.careerAreas).size;
  const reasons: Reason[] = [
    {
      factor: "goals",
      points: goalCount ? Math.round((goals.length / goalCount) * w.goals) : 0,
      max: w.goals,
      matched: goals,
      requested: goalCount,
    },
    {
      factor: "career",
      points: careerCount ? Math.round((careers.length / careerCount) * w.career) : 0,
      max: w.career,
      matched: careers,
      requested: careerCount,
      yearsExperience: provider.yearsExperience,
    },
    language,
    scheduleReason(student, provider, w.schedule, at),
    capacityReason(provider, w.capacity),
  ];
  return { ok: true, match: build(provider, service, reasons) };
}

function build(provider: ProviderProfile, service: ServiceType, reasons: Reason[]): Match {
  return {
    provider,
    service,
    score: reasons.reduce((sum, r) => sum + r.points, 0),
    reasons,
  };
}

export function findMatches(
  student: StudentProfile,
  providers: ProviderProfile[],
  at: Date = new Date(),
): MatchResult {
  const services = servicesSought(student);
  const result: MatchResult = {
    matches: [],
    excluded: { mentoring: {}, tutoring: {} },
    services,
    missingStudentInfo: {},
  };
  if (services.includes("tutoring") && student.subjects.length === 0)
    result.missingStudentInfo.tutoring = "subjects";
  if (
    services.includes("mentoring") &&
    student.goals.length === 0 &&
    student.careerAreas.length === 0
  )
    result.missingStudentInfo.mentoring = "goals_or_career";

  for (const provider of providers) {
    // Unlisted profiles (pending review, rejected, no directory consent) and
    // the student's own provider profile are never candidates.
    if (!isListed(provider) || provider.userId === student.userId) continue;
    for (const service of services) {
      const ev = evaluate(student, provider, service, at);
      if (ev.ok) result.matches.push(ev.match);
      else result.excluded[service][ev.code] = (result.excluded[service][ev.code] ?? 0) + 1;
    }
  }

  result.matches.sort(
    (a, b) =>
      b.score - a.score ||
      remainingCapacity(b.provider) - remainingCapacity(a.provider) ||
      a.provider.fullName.localeCompare(b.provider.fullName),
  );
  return result;
}
