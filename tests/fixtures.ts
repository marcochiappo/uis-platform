import type { ProviderProfile, StudentProfile } from "@/lib/domain/types";

const T = "2026-01-01T00:00:00.000Z";
/** A fixed winter date so DST doesn't change time-zone offsets between runs. */
export const WINTER = new Date("2026-01-14T12:00:00Z");

export function student(over: Partial<StudentProfile> = {}): StudentProfile {
  return {
    userId: "student-1",
    fullName: "Test Student",
    university: "Test University",
    degree: "BSc Physics",
    degreeLevel: "undergraduate",
    studyYear: 1,
    preferredLanguage: "it",
    languages: ["en"],
    timeZone: "Europe/Rome",
    goals: [],
    interests: [],
    seeking: "tutoring",
    subjects: ["calculus"],
    careerAreas: [],
    availability: ["mon-evening"],
    isDemo: false,
    createdAt: T,
    updatedAt: T,
    ...over,
  };
}

export function provider(over: Partial<ProviderProfile> = {}): ProviderProfile {
  return {
    userId: "provider-1",
    fullName: "Test Provider",
    headline: "",
    bio: "A test provider bio that is long enough to pass validation.",
    expertise: [],
    offersMentoring: false,
    offersTutoring: true,
    tutoringSubjects: ["calculus"],
    teachingLevels: ["undergraduate"],
    mentoringTopics: [],
    careerAreas: [],
    careerExperience: "",
    yearsExperience: 5,
    languages: ["it"],
    timeZone: "Europe/Rome",
    availability: ["mon-evening"],
    maxActiveMentees: 2,
    directoryConsent: true,
    isPaused: false,
    reviewStatus: "approved",
    reviewNote: null,
    activeCount: 0,
    isDemo: false,
    createdAt: T,
    updatedAt: T,
    ...over,
  };
}
