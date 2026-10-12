import { DomainError } from "./errors";
import type { RequestStatus } from "./types";

/**
 * Introduction request lifecycle. Mirrored by `public.transition_request` in
 * supabase/migrations — keep the two in sync.
 *
 *   pending ──mentor accepts──▶ accepted ──UIS confirms──▶ introduced ──▶ completed
 *
 *   pending  → declined   (mentor)
 *   pending  → withdrawn  (student)      accepted → withdrawn (student)
 *   any open → cancelled  (UIS admin)    introduced → completed (UIS admin or mentor)
 */

export type Party = "student" | "provider" | "admin";

export const OPEN_STATUSES: RequestStatus[] = ["pending", "accepted", "introduced"];
/** Statuses that occupy one of the mentor's mentee slots. */
export const CAPACITY_STATUSES: RequestStatus[] = ["accepted", "introduced"];
export const TERMINAL_STATUSES: RequestStatus[] = ["declined", "withdrawn", "completed", "cancelled"];

interface Rule {
  from: RequestStatus;
  to: RequestStatus;
  by: Party[];
}

export const TRANSITIONS: Rule[] = [
  { from: "pending", to: "accepted", by: ["provider"] },
  { from: "pending", to: "declined", by: ["provider"] },
  { from: "pending", to: "withdrawn", by: ["student"] },
  { from: "accepted", to: "withdrawn", by: ["student"] },
  { from: "accepted", to: "introduced", by: ["admin"] },
  { from: "introduced", to: "completed", by: ["admin", "provider"] },
  { from: "pending", to: "cancelled", by: ["admin"] },
  { from: "accepted", to: "cancelled", by: ["admin"] },
  { from: "introduced", to: "cancelled", by: ["admin"] },
];

export function allowedTransitions(from: RequestStatus, parties: Party[]): RequestStatus[] {
  return TRANSITIONS.filter((r) => r.from === from && r.by.some((p) => parties.includes(p))).map(
    (r) => r.to,
  );
}

export function canTransition(from: RequestStatus, to: RequestStatus, parties: Party[]): boolean {
  return allowedTransitions(from, parties).includes(to);
}

export function assertTransition(from: RequestStatus, to: RequestStatus, parties: Party[]): void {
  if (parties.length === 0) throw new DomainError("forbidden", "You are not part of this request.");
  const rule = TRANSITIONS.find((r) => r.from === from && r.to === to);
  if (!rule) throw new DomainError("invalid_state", `A ${from} request cannot become ${to}.`);
  if (!rule.by.some((p) => parties.includes(p)))
    throw new DomainError("forbidden", "You are not allowed to make this change.");
}

export function isOpen(status: RequestStatus): boolean {
  return OPEN_STATUSES.includes(status);
}
