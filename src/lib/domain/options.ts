// Controlled vocabularies. Values are stable keys stored in the database;
// human-readable labels live in the i18n message catalogs.

export const COMMUNITIES = ["italian"] as const;
export type CommunityId = (typeof COMMUNITIES)[number];
export const DEFAULT_COMMUNITY: CommunityId = "italian";

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const DAY_PARTS = ["morning", "afternoon", "evening"] as const;
export type DayPart = (typeof DAY_PARTS)[number];

/** Local-time hour ranges [start, end) for each part of the day. */
export const DAY_PART_HOURS: Record<DayPart, [number, number]> = {
  morning: [8, 12],
  afternoon: [12, 17],
  evening: [17, 21],
};

export type AvailabilitySlot = `${Weekday}-${DayPart}`;
export const AVAILABILITY_SLOTS: AvailabilitySlot[] = WEEKDAYS.flatMap((d) =>
  DAY_PARTS.map((p) => `${d}-${p}` as AvailabilitySlot),
);

export const TEACHING_LEVELS = ["high_school", "undergraduate", "graduate"] as const;
export type TeachingLevel = (typeof TEACHING_LEVELS)[number];

export const SEEKING = ["mentoring", "tutoring", "both"] as const;
export type Seeking = (typeof SEEKING)[number];

export const SERVICES = ["mentoring", "tutoring"] as const;
export type ServiceType = (typeof SERVICES)[number];

export const SUBJECTS = [
  "calculus",
  "linear_algebra",
  "statistics",
  "physics",
  "chemistry",
  "organic_chemistry",
  "biology",
  "economics",
  "accounting",
  "programming",
  "data_science",
  "law",
  "italian_language",
  "english_writing",
  "philosophy",
  "history",
] as const;
export type Subject = (typeof SUBJECTS)[number];

export const MENTORING_GOALS = [
  "career_direction",
  "internships",
  "graduate_school",
  "study_skills",
  "relocation",
  "networking",
  "entrepreneurship",
  "leadership",
] as const;
export type MentoringGoal = (typeof MENTORING_GOALS)[number];

export const CAREER_AREAS = [
  "consulting",
  "finance",
  "technology",
  "research_academia",
  "law",
  "medicine_health",
  "engineering",
  "public_policy",
  "arts_culture",
  "entrepreneurship",
  "marketing",
] as const;
export type CareerArea = (typeof CAREER_AREAS)[number];

export const LANGUAGES = ["it", "en", "es", "fr", "de", "pt", "zh", "ar"] as const;
export type LanguageCode = (typeof LANGUAGES)[number];

export const TIME_ZONES = [
  "Europe/Rome",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Zurich",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
] as const;
export type TimeZone = (typeof TIME_ZONES)[number];
