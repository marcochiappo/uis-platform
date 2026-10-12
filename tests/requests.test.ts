import { describe, expect, it } from "vitest";
import { DomainError } from "@/lib/domain/errors";
import { allowedTransitions, assertTransition, canTransition, TERMINAL_STATUSES } from "@/lib/domain/requests";
import type { RequestStatus } from "@/lib/domain/types";

describe("request state machine", () => {
  it("follows the happy path: pending → accepted → introduced → completed", () => {
    expect(canTransition("pending", "accepted", ["provider"])).toBe(true);
    expect(canTransition("accepted", "introduced", ["admin"])).toBe(true);
    expect(canTransition("introduced", "completed", ["provider"])).toBe(true);
    expect(canTransition("introduced", "completed", ["admin"])).toBe(true);
  });

  it("only lets the mentor accept or decline", () => {
    expect(canTransition("pending", "accepted", ["student"])).toBe(false);
    expect(canTransition("pending", "accepted", ["admin"])).toBe(false);
    expect(canTransition("pending", "declined", ["student"])).toBe(false);
  });

  it("only lets UIS confirm an introduction", () => {
    expect(canTransition("accepted", "introduced", ["provider"])).toBe(false);
    expect(canTransition("accepted", "introduced", ["student"])).toBe(false);
    expect(canTransition("pending", "introduced", ["admin"])).toBe(false);
  });

  it("lets the student withdraw before the introduction only", () => {
    expect(allowedTransitions("pending", ["student"])).toEqual(["withdrawn"]);
    expect(allowedTransitions("accepted", ["student"])).toEqual(["withdrawn"]);
    expect(allowedTransitions("introduced", ["student"])).toEqual([]);
  });

  it("lets admins cancel any open request", () => {
    for (const s of ["pending", "accepted", "introduced"] as RequestStatus[])
      expect(canTransition(s, "cancelled", ["admin"])).toBe(true);
  });

  it("has no way out of terminal states", () => {
    for (const s of TERMINAL_STATUSES) expect(allowedTransitions(s, ["student", "provider", "admin"])).toEqual([]);
  });

  it("distinguishes impossible transitions from unauthorised ones", () => {
    expect(() => assertTransition("declined", "accepted", ["provider"])).toThrow(
      expect.objectContaining({ code: "invalid_state" }),
    );
    expect(() => assertTransition("pending", "accepted", ["student"])).toThrow(expect.objectContaining({ code: "forbidden" }));
    expect(() => assertTransition("pending", "accepted", [])).toThrow(DomainError);
  });
});
