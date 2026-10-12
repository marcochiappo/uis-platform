import { createHmac, timingSafeEqual } from "node:crypto";

export const DEMO_COOKIE = "uis_demo_session";
const DEV_FALLBACK_SECRET = "uis-demo-only-insecure-secret";

function secret(): string {
  return process.env.DEMO_SESSION_SECRET || DEV_FALLBACK_SECRET;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

/** `${userId}.${hmac}` — tamper-evident so users can't switch identity by editing the cookie. */
export function encodeDemoSession(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function decodeDemoSession(cookie: string | undefined): string | null {
  if (!cookie) return null;
  const i = cookie.lastIndexOf(".");
  if (i <= 0) return null;
  const userId = cookie.slice(0, i);
  const given = Buffer.from(cookie.slice(i + 1));
  const expected = Buffer.from(sign(userId));
  return given.length === expected.length && timingSafeEqual(given, expected) ? userId : null;
}
