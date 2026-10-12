import Papa from "papaparse";
import type { ProspectInput } from "./types";

export const PROSPECT_CSV_COLUMNS = [
  "full_name",
  "email",
  "organization",
  "title",
  "location",
  "expertise",
  "linkedin_url",
  "notes",
  "community_note",
] as const;

const HEADER_ALIASES: Record<string, (typeof PROSPECT_CSV_COLUMNS)[number]> = {
  name: "full_name",
  full_name: "full_name",
  fullname: "full_name",
  email: "email",
  e_mail: "email",
  organization: "organization",
  organisation: "organization",
  company: "organization",
  expertise: "expertise",
  field: "expertise",
  linkedin: "linkedin_url",
  linkedin_url: "linkedin_url",
  notes: "notes",
  title: "title",
  job_title: "title",
  role: "title",
  location: "location",
  city: "location",
  community_note: "community_note",
  community: "community_note",
};

export const MAX_PROSPECT_ROWS = 1000;

export interface ProspectRowError {
  /** 1-based line number in the file, counting the header as line 1. */
  line: number;
  message: string;
}

/** A CSV row. `communityNote` becomes an unconfirmed signal, never a confirmed affiliation. */
export type ParsedProspectRow = ProspectInput & { communityNote: string | null };

export interface ParsedProspects {
  rows: ParsedProspectRow[];
  errors: ProspectRowError[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  // Neutralise spreadsheet formula injection when data is exported again.
  const t = v.trim().replace(/^[=+\-@]+/, "").slice(0, max);
  return t === "" ? null : t;
}

export function parseProspectCsv(csv: string): ParsedProspects {
  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => HEADER_ALIASES[h.trim().toLowerCase().replace(/[\s-]+/g, "_")] ?? h,
  });
  const errors: ProspectRowError[] = parsed.errors.map((e) => ({
    line: (e.row ?? 0) + 2,
    message: e.message,
  }));
  const fields = parsed.meta.fields ?? [];
  if (!fields.includes("full_name")) {
    return {
      rows: [],
      errors: [{ line: 1, message: "Missing required column \"full_name\" (or \"name\")." }],
    };
  }
  if (parsed.data.length > MAX_PROSPECT_ROWS) {
    return {
      rows: [],
      errors: [{ line: 1, message: `Files are limited to ${MAX_PROSPECT_ROWS} rows.` }],
    };
  }

  const rows: ParsedProspectRow[] = [];
  const seen = new Set<string>();
  parsed.data.forEach((raw, i) => {
    const line = i + 2;
    const fullName = clean(raw.full_name, 120);
    if (!fullName) return errors.push({ line, message: "Name is empty." });
    const email = clean(raw.email, 200)?.toLowerCase() ?? null;
    if (email && !EMAIL.test(email)) return errors.push({ line, message: `Invalid email "${email}".` });
    if (email && seen.has(email))
      return errors.push({ line, message: `Duplicate email "${email}" in this file.` });
    if (email) seen.add(email);
    const linkedinUrl = clean(raw.linkedin_url, 300);
    if (linkedinUrl && !/^https?:\/\//i.test(linkedinUrl))
      return errors.push({ line, message: "LinkedIn URL must start with http(s)://." });
    rows.push({
      fullName,
      email,
      organization: clean(raw.organization, 160),
      title: clean(raw.title, 200),
      location: clean(raw.location, 200),
      expertise: clean(raw.expertise, 300),
      linkedinUrl,
      notes: clean(raw.notes, 1000),
      communityNote: clean(raw.community_note, 300),
    });
  });
  return { rows, errors };
}
