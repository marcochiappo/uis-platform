import type { FieldErrors } from "./domain/validation";

export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: FieldErrors;
  /** Extra structured payload (e.g. CSV import report). */
  data?: unknown;
};

export const idle: ActionState = { status: "idle" };
