export type DomainErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid_state"
  | "validation"
  | "conflict";

/** An expected, user-presentable failure. Messages must not leak private data. */
export class DomainError extends Error {
  constructor(
    public code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}
