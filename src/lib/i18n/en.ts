import type {
  AvailabilitySlot,
  CareerArea,
  DayPart,
  LanguageCode,
  MentoringGoal,
  Seeking,
  ServiceType,
  Subject,
  TeachingLevel,
  Weekday,
} from "../domain/options";
import type {
  CommunityAffiliation,
  EmailStatus,
  EnrichmentStatus,
  OutreachStatus,
  ProspectReview,
  ProspectSource,
  ProspectStatus,
  RequestStatus,
  ReviewStatus,
} from "../domain/types";

const list = (items: string[]) =>
  items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/**
 * English message catalog. A future `it.ts` must satisfy the same `Messages`
 * type; components read strings through `getMessages()` rather than inlining.
 */
export const en = {
  locale: "en",
  app: {
    name: "UIS",
    fullName: "United International Society",
    tagline: "Mentoring and tutoring for the international student community",
  },
  nav: {
    home: "Home",
    student: "Find support",
    mentor: "Mentor & tutor",
    admin: "UIS admin",
    profile: "Profile",
    signIn: "Sign in",
    signUp: "Join UIS",
    signOut: "Sign out",
    skipToContent: "Skip to main content",
  },
  demo: {
    banner:
      "Demo mode: all people and data are fictional, stored locally, and no emails are sent.",
    badge: "Fictional demo profile",
  },
  common: {
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    loading: "Loading…",
    retry: "Try again",
    optional: "optional",
    required: "required",
    edit: "Edit",
    none: "None",
    you: "You",
  },
  services: {
    mentoring: "Mentoring",
    tutoring: "Academic tutoring",
  } satisfies Record<ServiceType, string>,
  seeking: {
    mentoring: "Mentoring",
    tutoring: "Tutoring",
    both: "Both",
  } satisfies Record<Seeking, string>,
  levels: {
    high_school: "High school",
    undergraduate: "Undergraduate",
    graduate: "Graduate (master's / PhD)",
  } satisfies Record<TeachingLevel, string>,
  subjects: {
    calculus: "Calculus",
    linear_algebra: "Linear algebra",
    statistics: "Statistics",
    physics: "Physics",
    chemistry: "Chemistry",
    organic_chemistry: "Organic chemistry",
    biology: "Biology",
    economics: "Economics",
    accounting: "Accounting",
    programming: "Programming",
    data_science: "Data science",
    law: "Law",
    italian_language: "Italian language",
    english_writing: "English academic writing",
    philosophy: "Philosophy",
    history: "History",
  } satisfies Record<Subject, string>,
  goals: {
    career_direction: "Choosing a career direction",
    internships: "Finding internships",
    graduate_school: "Applying to graduate school",
    study_skills: "Study skills and exams",
    relocation: "Settling into a new country",
    networking: "Building a professional network",
    entrepreneurship: "Starting a venture",
    leadership: "Leadership and confidence",
  } satisfies Record<MentoringGoal, string>,
  careerAreas: {
    consulting: "Consulting",
    finance: "Finance",
    technology: "Technology",
    research_academia: "Research & academia",
    law: "Law",
    medicine_health: "Medicine & health",
    engineering: "Engineering",
    public_policy: "Public policy",
    arts_culture: "Arts & culture",
    entrepreneurship: "Entrepreneurship",
    marketing: "Marketing",
  } satisfies Record<CareerArea, string>,
  languages: {
    it: "Italian",
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    pt: "Portuguese",
    zh: "Chinese",
    ar: "Arabic",
  } satisfies Record<LanguageCode, string>,
  weekdays: {
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun",
  } satisfies Record<Weekday, string>,
  dayParts: {
    morning: "Morning (8–12)",
    afternoon: "Afternoon (12–17)",
    evening: "Evening (17–21)",
  } satisfies Record<DayPart, string>,
  dayPartsShort: {
    morning: "morning",
    afternoon: "afternoon",
    evening: "evening",
  } satisfies Record<DayPart, string>,
  requestStatus: {
    pending: "Awaiting mentor",
    accepted: "Accepted — UIS is arranging the introduction",
    declined: "Declined",
    withdrawn: "Withdrawn",
    introduced: "Introduced — active",
    completed: "Completed",
    cancelled: "Cancelled by UIS",
  } satisfies Record<RequestStatus, string>,
  requestStatusShort: {
    pending: "Pending",
    accepted: "Accepted",
    declined: "Declined",
    withdrawn: "Withdrawn",
    introduced: "Active",
    completed: "Completed",
    cancelled: "Cancelled",
  } satisfies Record<RequestStatus, string>,
  reviewStatus: {
    pending: "Pending UIS review",
    approved: "Approved",
    rejected: "Not approved",
  } satisfies Record<ReviewStatus, string>,
  prospectStatus: {
    new: "New",
    invited: "Invited",
    interested: "Interested",
    declined: "Declined",
    joined: "Joined UIS",
  } satisfies Record<ProspectStatus, string>,
  recruitment: {
    review: { unreviewed: "Not reviewed", approved: "Approved for outreach", rejected: "Not a fit" } satisfies Record<ProspectReview, string>,
    affiliation: {
      unconfirmed: "Community link unconfirmed",
      confirmed: "Community link confirmed",
      not_affiliated: "No community link",
    } satisfies Record<CommunityAffiliation, string>,
    emailStatus: {
      none: "No email",
      provided: "Email provided (unverified)",
      verified: "Email verified by Apollo",
      unverified: "Email unverified",
      unavailable: "No email available",
    } satisfies Record<EmailStatus, string>,
    enrichment: {
      not_requested: "Not enriched",
      found_email: "Enriched: email found",
      no_email: "Enriched: no email available",
      no_match: "Enriched: no confident match",
      error: "Enrichment failed",
    } satisfies Record<EnrichmentStatus, string>,
    outreach: {
      draft: "Draft",
      approved: "Approved, not sent",
      sending: "Sending (outcome pending)",
      sent: "Sent",
      failed: "Delivery failed",
      bounced: "Bounced",
      mock_logged: "Mock only, not delivered",
      cancelled: "Cancelled",
    } satisfies Record<OutreachStatus, string>,
    source: {
      csv: "CSV import",
      apollo: "Apollo",
      apollo_mock: "Apollo MOCK (fictional)",
      manual: "Added manually",
      "demo-seed": "Demo seed (fictional)",
    } satisfies Record<ProspectSource, string>,
  },
  matching: {
    scoreLabel: (score: number) => `Match score ${score} out of 100`,
    howScored: "How this score was calculated",
    reasons: {
      subjects: (matched: string[], requested: number) =>
        `Tutors ${list(matched)} — ${matched.length} of the ${requested} subject${requested === 1 ? "" : "s"} you asked for.`,
      level: (level: string) => `Teaches at your level (${level}).`,
      goals: (matched: string[], requested: number) =>
        matched.length
          ? `Mentors on ${list(matched)} — ${matched.length} of your ${requested} goal${requested === 1 ? "" : "s"}.`
          : requested
            ? "None of your mentoring goals are listed as topics."
            : "You haven't listed mentoring goals.",
      career: (matched: string[], requested: number, years: number) =>
        matched.length
          ? `${years} year${years === 1 ? "" : "s"} of experience; works in ${list(matched)} (${matched.length} of your ${requested} career area${requested === 1 ? "" : "s"}).`
          : requested
            ? "No overlap with your career areas."
            : "You haven't listed career areas.",
      languagePreferred: (lang: string) => `Speaks ${lang}, your preferred language.`,
      languageShared: (langs: string[]) =>
        `Doesn't list your preferred language, but you both speak ${list(langs)}.`,
      schedule: (hours: number, slots: string[]) =>
        hours > 0
          ? `About ${hours} hour${hours === 1 ? "" : "s"} a week of overlapping availability (${list(slots)}, your time).`
          : "No overlapping availability yet — you would need to agree on a time.",
      capacity: (remaining: number, capacity: number) =>
        `${remaining} of ${capacity} mentee spot${capacity === 1 ? "" : "s"} open.`,
    },
    exclusions: {
      unavailable: (n: number) => `${n} paused or at full capacity`,
      service_not_offered: (n: number) => `${n} don't offer this service`,
      no_subject_overlap: (n: number) => `${n} don't tutor your subjects`,
      level_not_taught: (n: number) => `${n} tutor your subjects but not at your level`,
      no_goal_or_career_overlap: (n: number) => `${n} don't cover your goals or career areas`,
      no_shared_language: (n: number) => `${n} don't share a language with you`,
    },
  },
};

export type Messages = typeof en;

export function slotLabel(m: Messages, slot: AvailabilitySlot): string {
  const [d, p] = slot.split("-") as [Weekday, DayPart];
  return `${m.weekdays[d]} ${m.dayPartsShort[p]}`;
}
