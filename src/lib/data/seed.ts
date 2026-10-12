/**
 * FICTIONAL DEMO DATA.
 *
 * Every person, university, email address and request below is invented for
 * demonstration purposes. Email addresses use the reserved `.example` domain so
 * nothing can ever be delivered to them. All records are flagged `isDemo`.
 *
 * Used by demo mode (src/lib/data/demo-store.ts) and by
 * scripts/generate-seed-sql.ts to produce supabase/seed.sql.
 */
import { buildProspect } from "../domain/recruitment.ts"; // explicit extension: also run by Node in scripts/
import type {
  Account,
  IntroRequest,
  Prospect,
  ProspectInput,
  ProviderProfile,
  RequestEvent,
  StudentProfile,
} from "../domain/types";

export const DEMO_EMAIL_DOMAIN = "uis-demo.example";
const T0 = "2026-09-01T09:00:00.000Z";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const DEMO_IDS = {
  admin: id(1),
  luca: id(11),
  sofia: id(12),
  matteo: id(13),
  giulia: id(14),
  anna: id(15),
  elena: id(21),
  marco: id(22),
  francesca: id(23),
  andrea: id(24),
  paolo: id(25),
  valentina: id(26),
  roberto: id(27),
} as const;

function account(key: keyof typeof DEMO_IDS, fullName: string, role: Account["role"] = "member"): Account {
  return {
    id: DEMO_IDS[key],
    email: `${key}@${DEMO_EMAIL_DOMAIN}`,
    fullName,
    role,
    communityId: "italian",
    linkedinUrl: null,
    isDemo: true,
    createdAt: T0,
  };
}

export const seedAccounts: Account[] = [
  account("admin", "Chiara Bianchi (UIS staff)", "admin"),
  account("luca", "Luca Marino"),
  account("sofia", "Sofia Greco"),
  account("matteo", "Matteo Conti"),
  account("giulia", "Giulia Ferri"),
  account("anna", "Anna Rinaldi"),
  { ...account("elena", "Dr. Elena Ricci"), linkedinUrl: "https://linkedin.com/in/elena-ricci-demo" },
  account("marco", "Marco Galli"),
  account("francesca", "Francesca Lombardi"),
  account("andrea", "Andrea Costa"),
  account("paolo", "Paolo De Luca"),
  account("valentina", "Valentina Moretti"),
  account("roberto", "Roberto Esposito"),
];

const studentBase = { isDemo: true, createdAt: T0, updatedAt: T0, interests: [] as string[] };

export const seedStudents: StudentProfile[] = [
  {
    ...studentBase,
    userId: DEMO_IDS.luca,
    fullName: "Luca Marino",
    university: "Northfield University (fictional)",
    degree: "BSc Mechanical Engineering",
    degreeLevel: "undergraduate",
    studyYear: 2,
    preferredLanguage: "it",
    languages: ["en"],
    timeZone: "Europe/Rome",
    goals: [],
    interests: ["robotics", "cycling"],
    seeking: "tutoring",
    subjects: ["calculus", "physics"],
    careerAreas: [],
    availability: ["tue-evening", "thu-evening", "sat-morning"],
  },
  {
    ...studentBase,
    userId: DEMO_IDS.sofia,
    fullName: "Sofia Greco",
    university: "Hudson Graduate School (fictional)",
    degree: "MSc Finance",
    degreeLevel: "graduate",
    studyYear: 1,
    preferredLanguage: "en",
    languages: ["it"],
    timeZone: "America/New_York",
    goals: ["career_direction", "internships", "networking"],
    interests: ["impact investing"],
    seeking: "mentoring",
    subjects: [],
    careerAreas: ["finance", "consulting"],
    availability: ["mon-evening", "wed-evening", "sun-afternoon"],
  },
  {
    ...studentBase,
    userId: DEMO_IDS.matteo,
    fullName: "Matteo Conti",
    university: "Thames Metropolitan University (fictional)",
    degree: "BSc Computer Science",
    degreeLevel: "undergraduate",
    studyYear: 3,
    preferredLanguage: "it",
    languages: ["en"],
    timeZone: "Europe/London",
    goals: ["internships", "entrepreneurship"],
    interests: ["open source", "football"],
    seeking: "both",
    subjects: ["programming", "statistics"],
    careerAreas: ["technology", "entrepreneurship"],
    availability: ["wed-afternoon", "fri-afternoon", "sat-afternoon"],
  },
  {
    ...studentBase,
    userId: DEMO_IDS.giulia,
    fullName: "Giulia Ferri",
    university: "Northfield University (fictional)",
    degree: "MSc Pharmaceutical Chemistry",
    degreeLevel: "graduate",
    studyYear: 1,
    preferredLanguage: "it",
    languages: [],
    timeZone: "Europe/Rome",
    goals: [],
    interests: [],
    seeking: "tutoring",
    subjects: ["organic_chemistry"],
    careerAreas: [],
    availability: ["mon-morning", "wed-morning"],
  },
  {
    ...studentBase,
    userId: DEMO_IDS.anna,
    fullName: "Anna Rinaldi",
    university: "Hudson Graduate School (fictional)",
    degree: "BA Economics",
    degreeLevel: "undergraduate",
    studyYear: 4,
    preferredLanguage: "it",
    languages: ["en"],
    timeZone: "America/New_York",
    goals: ["internships"],
    interests: [],
    seeking: "mentoring",
    subjects: [],
    careerAreas: ["finance"],
    availability: ["mon-evening"],
  },
];

const providerBase = {
  isDemo: true,
  createdAt: T0,
  updatedAt: T0,
  isPaused: false,
  reviewStatus: "approved" as const,
  reviewNote: null,
  activeCount: 0,
  directoryConsent: true,
  headline: "",
  expertise: [] as string[],
  offersMentoring: false,
  offersTutoring: false,
  tutoringSubjects: [],
  teachingLevels: [],
  mentoringTopics: [],
  careerAreas: [],
  careerExperience: "",
  yearsExperience: 0,
};

export const seedProviders: ProviderProfile[] = [
  {
    ...providerBase,
    userId: DEMO_IDS.elena,
    fullName: "Dr. Elena Ricci",
    headline: "Physics postdoc · tutors maths and physics",
    bio: "Fictional demo profile. Postdoctoral researcher in applied physics who enjoys helping first- and second-year students build solid foundations in calculus and mechanics.",
    expertise: ["applied physics", "numerical methods"],
    offersMentoring: true,
    offersTutoring: true,
    tutoringSubjects: ["calculus", "linear_algebra", "physics"],
    teachingLevels: ["undergraduate", "graduate"],
    mentoringTopics: ["graduate_school", "study_skills"],
    careerAreas: ["research_academia", "engineering"],
    careerExperience: "PhD in physics; 4 years as a teaching assistant; now a postdoctoral researcher.",
    yearsExperience: 9,
    languages: ["it", "en"],
    timeZone: "Europe/Rome",
    availability: ["tue-evening", "thu-evening", "sun-morning"],
    maxActiveMentees: 3,
  },
  {
    ...providerBase,
    userId: DEMO_IDS.marco,
    fullName: "Marco Galli",
    headline: "Investment banking VP · career mentor",
    bio: "Fictional demo profile. Moved from Italy to New York after university and has spent twelve years in investment banking and corporate finance.",
    expertise: ["corporate finance", "recruiting"],
    offersMentoring: true,
    mentoringTopics: ["career_direction", "internships", "networking"],
    careerAreas: ["finance", "consulting"],
    careerExperience: "Analyst to VP in investment banking; previously two years in strategy consulting.",
    yearsExperience: 12,
    languages: ["it", "en"],
    timeZone: "America/New_York",
    availability: ["mon-evening", "wed-evening"],
    maxActiveMentees: 2,
  },
  {
    ...providerBase,
    userId: DEMO_IDS.francesca,
    fullName: "Francesca Lombardi",
    headline: "Software engineer & startup founder",
    bio: "Fictional demo profile. Software engineer turned founder; tutors programming and statistics and mentors students exploring tech careers.",
    expertise: ["Python", "machine learning", "startups"],
    offersMentoring: true,
    offersTutoring: true,
    tutoringSubjects: ["programming", "data_science", "statistics"],
    teachingLevels: ["undergraduate"],
    mentoringTopics: ["internships", "entrepreneurship"],
    careerAreas: ["technology", "entrepreneurship"],
    careerExperience: "Five years as a software engineer; co-founded a small analytics startup.",
    yearsExperience: 7,
    languages: ["en", "it"],
    timeZone: "Europe/London",
    availability: ["wed-afternoon", "fri-afternoon"],
    maxActiveMentees: 4,
  },
  {
    ...providerBase,
    userId: DEMO_IDS.andrea,
    fullName: "Andrea Costa",
    headline: "Chemistry teacher",
    bio: "Fictional demo profile. Secondary-school chemistry teacher who also tutors first-year university chemistry courses.",
    offersTutoring: true,
    tutoringSubjects: ["chemistry", "organic_chemistry"],
    teachingLevels: ["high_school", "undergraduate"],
    languages: ["it"],
    timeZone: "Europe/Rome",
    availability: ["mon-afternoon", "wed-afternoon"],
    maxActiveMentees: 3,
    yearsExperience: 15,
  },
  {
    ...providerBase,
    userId: DEMO_IDS.matteo,
    fullName: "Matteo Conti",
    headline: "CS student · Italian language tutor",
    bio: "Fictional demo profile. Computer science student who also helps secondary-school students with Italian grammar and writing.",
    offersTutoring: true,
    tutoringSubjects: ["italian_language"],
    teachingLevels: ["high_school"],
    languages: ["it", "en"],
    timeZone: "Europe/London",
    availability: ["sat-morning"],
    maxActiveMentees: 2,
  },
  {
    ...providerBase,
    userId: DEMO_IDS.paolo,
    fullName: "Paolo De Luca",
    headline: "Management consultant",
    bio: "Fictional demo profile. Management consultant currently on a busy project, so mentoring is paused.",
    offersMentoring: true,
    mentoringTopics: ["career_direction", "internships"],
    careerAreas: ["consulting"],
    yearsExperience: 6,
    languages: ["it", "en"],
    timeZone: "Europe/Rome",
    availability: ["mon-evening"],
    maxActiveMentees: 2,
    isPaused: true,
  },
  {
    ...providerBase,
    userId: DEMO_IDS.valentina,
    fullName: "Valentina Moretti",
    headline: "Corporate lawyer",
    bio: "Fictional demo profile. Corporate lawyer who has applied to mentor; waiting for UIS review, so not visible to students yet.",
    offersMentoring: true,
    mentoringTopics: ["career_direction"],
    careerAreas: ["law"],
    yearsExperience: 10,
    languages: ["it", "en", "fr"],
    timeZone: "Europe/Paris",
    availability: ["tue-evening"],
    maxActiveMentees: 2,
    reviewStatus: "pending",
  },
  {
    ...providerBase,
    userId: DEMO_IDS.roberto,
    fullName: "Roberto Esposito",
    headline: "Economist",
    bio: "Fictional demo profile. Approved economist who has not given permission to appear in the directory.",
    offersTutoring: true,
    tutoringSubjects: ["economics", "statistics"],
    teachingLevels: ["undergraduate"],
    languages: ["it", "en"],
    timeZone: "Europe/Rome",
    availability: ["fri-afternoon"],
    maxActiveMentees: 2,
    directoryConsent: false,
  },
];

function request(
  n: number,
  studentId: string,
  providerId: string,
  service: IntroRequest["service"],
  status: IntroRequest["status"],
  message: string,
  matchScore: number,
  matchReasons: string[],
): IntroRequest {
  return {
    id: id(100 + n),
    studentId,
    providerId,
    service,
    message,
    status,
    matchScore,
    matchReasons,
    createdAt: `2026-09-0${n + 1}T10:00:00.000Z`,
    updatedAt: `2026-09-0${n + 1}T12:00:00.000Z`,
    respondedAt: status === "pending" ? null : `2026-09-0${n + 1}T11:00:00.000Z`,
    introducedAt: status === "introduced" ? `2026-09-0${n + 1}T12:00:00.000Z` : null,
    closedAt: status === "withdrawn" ? `2026-09-0${n + 1}T12:00:00.000Z` : null,
  };
}

export const seedRequests: IntroRequest[] = [
  request(1, DEMO_IDS.anna, DEMO_IDS.marco, "mentoring", "introduced",
    "Hi Marco, I'm looking for advice on finance internships in New York.", 78,
    ["Mentors on Finding internships — 1 of your 1 goal."]),
  request(2, DEMO_IDS.sofia, DEMO_IDS.marco, "mentoring", "pending",
    "I'd love to hear how you moved from consulting into banking.", 86,
    ["Mentors on Choosing a career direction, Finding internships and Building a professional network — 3 of your 3 goals."]),
  request(3, DEMO_IDS.matteo, DEMO_IDS.francesca, "tutoring", "accepted",
    "Could you help me prepare for my statistics exam?", 90,
    ["Tutors Programming and Statistics — 2 of the 2 subjects you asked for."]),
  request(4, DEMO_IDS.anna, DEMO_IDS.paolo, "mentoring", "withdrawn",
    "Interested in consulting recruiting.", 60, ["Mentors on Finding internships — 1 of your 1 goal."]),
];

export const seedEvents: RequestEvent[] = seedRequests.flatMap((r, i) => {
  const events: RequestEvent[] = [
    { id: `seed-${i}-0`, requestId: r.id, fromStatus: null, toStatus: "pending", actorId: r.studentId, note: null, createdAt: r.createdAt },
  ];
  if (r.status === "accepted" || r.status === "introduced")
    events.push({ id: `seed-${i}-1`, requestId: r.id, fromStatus: "pending", toStatus: "accepted", actorId: r.providerId, note: null, createdAt: r.respondedAt! });
  if (r.status === "introduced")
    events.push({ id: `seed-${i}-2`, requestId: r.id, fromStatus: "accepted", toStatus: "introduced", actorId: DEMO_IDS.admin, note: "Introduction email sent by UIS.", createdAt: r.introducedAt! });
  if (r.status === "pending" || r.status === "accepted" || r.status === "introduced") return events;
  events.push({ id: `seed-${i}-3`, requestId: r.id, fromStatus: "pending", toStatus: r.status, actorId: r.studentId, note: null, createdAt: r.updatedAt });
  return events;
});

const prospect = (n: number, input: ProspectInput, patch: Partial<Prospect> = {}): Prospect => ({
  ...buildProspect(id(200 + n), { source: "demo-seed", sourceDetail: "Fictional demo data", ...input }, DEMO_IDS.admin, T0),
  ...patch,
});

/** Fictional recruitment candidates. Note: names are never used as community signals. */
export const seedProspects: Prospect[] = [
  prospect(0, {
    fullName: "Lorenzo Fontana",
    email: `lorenzo.fontana@${DEMO_EMAIL_DOMAIN}`,
    organization: "Fictional Aerospace Ltd",
    title: "Propulsion Engineer",
    location: "Turin, Italy",
    expertise: "Aerospace engineering",
    linkedinUrl: null,
    notes: "Fictional prospect. Unreviewed: location is a signal, not a confirmed affiliation.",
    communitySignals: [{ kind: "location", detail: "Location: Turin, Italy", source: "demo-seed", recordedAt: T0 }],
  }),
  prospect(
    1,
    {
      fullName: "Beatrice Santoro",
      email: `beatrice.santoro@${DEMO_EMAIL_DOMAIN}`,
      organization: "Example Health Institute",
      title: "Clinical Research Lead",
      location: "London, United Kingdom",
      expertise: "Clinical research",
      linkedinUrl: null,
      notes: "Fictional prospect, reviewed and ready for an invitation draft.",
    },
    {
      reviewStatus: "approved",
      communityAffiliation: "confirmed",
      affiliationEvidence: "Said she volunteers with an Italian students' association when UIS met her at a (fictional) alumni event.",
      affiliationReviewedBy: DEMO_IDS.admin,
      affiliationReviewedAt: T0,
    },
  ),
  prospect(
    2,
    {
      fullName: "Davide Marchetti",
      email: `davide.marchetti@${DEMO_EMAIL_DOMAIN}`,
      organization: "Demo Capital Partners",
      title: "Investment Associate",
      location: null,
      expertise: "Venture capital",
      linkedinUrl: null,
      notes: "Fictional prospect, invited in person (status set manually).",
    },
    { reviewStatus: "approved", status: "invited" },
  ),
  prospect(3, {
    fullName: "Hannah Example",
    email: null,
    organization: "Example University Hospital",
    title: "Cardiologist",
    location: "Boston, United States",
    expertise: "Medicine",
    linkedinUrl: null,
    notes: "Fictional prospect without an email address.",
  }),
];
