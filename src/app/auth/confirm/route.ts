import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { connection, type NextRequest } from "next/server";
import { claimPendingInvite } from "@/lib/auth/invite";
import { isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

// Email confirmation link target (Supabase "Confirm signup" template → /auth/confirm?token_hash=…&type=email).
export async function GET(request: NextRequest) {
  await connection(); // always run per request; never prerender
  if (isDemoMode()) redirect("/login");
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next") ?? "/onboarding";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/onboarding";

  if (tokenHash && type) {
    const sb = await createClient();
    const { error } = await sb.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) redirect((await claimPendingInvite()) ? "/onboarding?invited=1" : next);
  }
  redirect("/login?error=confirm");
}
