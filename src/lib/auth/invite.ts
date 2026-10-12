import "server-only";
import { cookies } from "next/headers";
import { getContext } from "../server";
import { claimInvitation } from "../services";

/**
 * Invitation links (/signup?invite=…) are remembered in a short-lived httpOnly
 * cookie so the invite survives email confirmation. Once the person is signed
 * in, the invite is claimed: their account is linked to the candidate record
 * and marked "joined". That's all — no mentor profile, approval or match is created.
 */
export const INVITE_COOKIE = "uis_invite";

export async function rememberInvite(token: string | null | undefined) {
  if (!token || token.length < 24 || token.length > 200) return;
  (await cookies()).set(INVITE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

/** Returns true when an invitation was linked to the signed-in user. */
export async function claimPendingInvite(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(INVITE_COOKIE)?.value;
  if (!token) return false;
  const ctx = await getContext();
  if (!ctx.actor) return false;
  let claimed = false;
  try {
    claimed = await claimInvitation(ctx, token);
  } catch (e) {
    console.error("[invite] claim failed", e);
  }
  jar.delete(INVITE_COOKIE);
  return claimed;
}
