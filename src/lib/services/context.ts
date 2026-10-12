import type { Env } from "../config";
import type { DataStore } from "../data/store";
import { DomainError } from "../domain/errors";
import type { Actor } from "../domain/types";
import type { Mailer } from "../email";
import type { ApolloConfig } from "../recruitment/apollo";

/** External integrations used by the recruitment workflow (injected so tests can mock them). */
export interface RecruitmentDeps {
  apollo: ApolloConfig;
  /** Environment used to decide whether a real sending account is configured. */
  env: Env;
  demo: boolean;
  /** Override token generation in tests. */
  token?: () => string;
  /** HTTP transport for the real email provider (tests inject a fake). */
  fetchImpl?: typeof fetch;
}

/**
 * The service layer is the single place where application permissions are
 * decided. Every exported function takes the signed-in actor (or null) and
 * re-checks access itself; callers never pass "trusted" flags.
 */
export interface ServiceContext {
  store: DataStore;
  actor: Actor | null;
  mailer?: Mailer;
  now?: () => Date;
  recruitment?: RecruitmentDeps;
}

export function requireActor(ctx: ServiceContext): Actor {
  if (!ctx.actor) throw new DomainError("unauthenticated", "Please sign in to continue.");
  return ctx.actor;
}

export function requireAdmin(ctx: ServiceContext): Actor {
  const actor = requireActor(ctx);
  if (actor.role !== "admin") throw new DomainError("forbidden", "This area is for UIS administrators only.");
  return actor;
}
