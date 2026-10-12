import type { Reason } from "../domain/matching";
import { en, slotLabel, type Messages } from "./en";

export type { Messages };
export { slotLabel };

export const SUPPORTED_LOCALES = ["en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

const catalogs: Record<Locale, Messages> = { en };

/** Add `it` to SUPPORTED_LOCALES and `catalogs` to ship the Italian interface. */
export function getMessages(locale: Locale = DEFAULT_LOCALE): Messages {
  return catalogs[locale] ?? en;
}

export function formatReason(r: Reason, m: Messages = en): string {
  const R = m.matching.reasons;
  switch (r.factor) {
    case "subjects":
      return R.subjects(r.matched.map((s) => m.subjects[s]), r.requested);
    case "level":
      return R.level(m.levels[r.level]);
    case "goals":
      return R.goals(r.matched.map((g) => m.goals[g]), r.requested);
    case "career":
      return R.career(r.matched.map((c) => m.careerAreas[c]), r.requested, r.yearsExperience);
    case "language":
      return r.preferred
        ? R.languagePreferred(m.languages[r.languages[0]])
        : R.languageShared(r.languages.map((l) => m.languages[l]));
    case "schedule":
      return R.schedule(r.hours, r.slots.map((s) => slotLabel(m, s)));
    case "capacity":
      return R.capacity(r.remaining, r.capacity);
  }
}
