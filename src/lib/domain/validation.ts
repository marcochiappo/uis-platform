import { z } from "zod";
import {
  AVAILABILITY_SLOTS,
  CAREER_AREAS,
  LANGUAGES,
  MENTORING_GOALS,
  SEEKING,
  SUBJECTS,
  TEACHING_LEVELS,
  TIME_ZONES,
} from "./options";

const text = (max: number) => z.string().trim().max(max);
const required = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} is too long.`);
const unique = <T extends z.ZodType>(item: T) =>
  z.array(item).transform((xs) => [...new Set(xs)] as z.infer<T>[]);

/** Comma-separated free-text tags ("robotics, opera") → trimmed, de-duplicated list. */
const tags = z
  .string()
  .default("")
  .transform((s) =>
    [...new Set(s.split(",").map((t) => t.trim()).filter(Boolean))].map((t) => t.slice(0, 40)),
  )
  .pipe(z.array(z.string()).max(15, "Please list at most 15 items."));

export const studentProfileSchema = z
  .object({
    fullName: required(100, "Name"),
    university: required(120, "University"),
    degree: required(120, "Degree"),
    degreeLevel: z.enum(TEACHING_LEVELS, "Choose your current level of study."),
    studyYear: z.preprocess(
      (v) => (v === "" || v == null ? null : Number(v)),
      z.number().int().min(1, "Year must be between 1 and 10.").max(10, "Year must be between 1 and 10.").nullable(),
    ),
    preferredLanguage: z.enum(LANGUAGES, "Choose a preferred language."),
    languages: unique(z.enum(LANGUAGES)),
    timeZone: z.enum(TIME_ZONES, "Choose your time zone."),
    goals: unique(z.enum(MENTORING_GOALS)),
    interests: tags,
    seeking: z.enum(SEEKING, "Choose mentoring, tutoring, or both."),
    subjects: unique(z.enum(SUBJECTS)),
    careerAreas: unique(z.enum(CAREER_AREAS)),
    availability: unique(z.enum(AVAILABILITY_SLOTS)).refine((a) => a.length > 0, {
      message: "Select at least one time when you are usually available.",
    }),
  })
  .superRefine((v, ctx) => {
    if (v.seeking !== "mentoring" && v.subjects.length === 0)
      ctx.addIssue({
        code: "custom",
        path: ["subjects"],
        message: "Tutoring needs at least one subject.",
      });
    if (v.seeking !== "tutoring" && v.goals.length === 0 && v.careerAreas.length === 0)
      ctx.addIssue({
        code: "custom",
        path: ["goals"],
        message: "Mentoring needs at least one goal or career area.",
      });
  });

export type StudentProfileForm = z.infer<typeof studentProfileSchema>;

export const providerProfileSchema = z
  .object({
    fullName: required(100, "Name"),
    headline: text(140),
    bio: required(1500, "Bio").min(40, "Please write at least 40 characters so students know who you are."),
    expertise: tags,
    offersMentoring: z.boolean(),
    offersTutoring: z.boolean(),
    tutoringSubjects: unique(z.enum(SUBJECTS)),
    teachingLevels: unique(z.enum(TEACHING_LEVELS)),
    mentoringTopics: unique(z.enum(MENTORING_GOALS)),
    careerAreas: unique(z.enum(CAREER_AREAS)),
    careerExperience: text(1500),
    yearsExperience: z.coerce
      .number("Enter a number of years.")
      .int()
      .min(0, "Years of experience cannot be negative.")
      .max(70, "Please enter a realistic number of years."),
    languages: unique(z.enum(LANGUAGES)).refine((a) => a.length > 0, {
      message: "Select at least one language you can mentor or tutor in.",
    }),
    timeZone: z.enum(TIME_ZONES, "Choose your time zone."),
    availability: unique(z.enum(AVAILABILITY_SLOTS)).refine((a) => a.length > 0, {
      message: "Select at least one time when you are usually available.",
    }),
    maxActiveMentees: z.coerce
      .number("Enter a number.")
      .int()
      .min(1, "Allow at least one active mentee.")
      .max(50, "The maximum is 50 active mentees."),
    linkedinUrl: z
      .string()
      .trim()
      .default("")
      .refine((s) => s === "" || /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/.+/i.test(s), {
        message: "Enter a full LinkedIn URL starting with https://linkedin.com/ or leave it empty.",
      })
      .transform((s) => (s === "" ? null : s)),
    directoryConsent: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (!v.offersMentoring && !v.offersTutoring)
      ctx.addIssue({
        code: "custom",
        path: ["offersMentoring"],
        message: "Offer mentoring, tutoring, or both.",
      });
    if (v.offersTutoring && v.tutoringSubjects.length === 0)
      ctx.addIssue({ code: "custom", path: ["tutoringSubjects"], message: "Select the subjects you tutor." });
    if (v.offersTutoring && v.teachingLevels.length === 0)
      ctx.addIssue({ code: "custom", path: ["teachingLevels"], message: "Select the levels you can teach." });
    if (v.offersMentoring && v.mentoringTopics.length === 0 && v.careerAreas.length === 0)
      ctx.addIssue({
        code: "custom",
        path: ["mentoringTopics"],
        message: "Select at least one mentoring topic or career area.",
      });
  });

export type ProviderProfileForm = z.infer<typeof providerProfileSchema>;

/** Public sign-up. There is deliberately no role field: admin cannot be chosen here. */
export const signupSchema = z.object({
  fullName: required(100, "Name"),
  email: z.email("Enter a valid email address.").max(200),
  password: z.string().min(10, "Use at least 10 characters."),
});

export const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export const introRequestSchema = z.object({
  providerId: z.string().min(1),
  service: z.enum(["mentoring", "tutoring"]),
  message: text(1000),
});

export type FieldErrors = Record<string, string[]>;

export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/** Read a FormData into a plain object, keeping multi-value fields as arrays. */
export function formToObject(form: FormData, arrays: string[], booleans: string[] = []) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string" && !arrays.includes(k)) out[k] = v;
  for (const k of arrays) out[k] = form.getAll(k).filter((v): v is string => typeof v === "string");
  for (const k of booleans) out[k] = form.get(k) === "on" || form.get(k) === "true";
  return out;
}
