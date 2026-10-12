/**
 * Demo mode runs entirely locally: fictional data in a JSON file, a cookie-based
 * demo sign-in, and no outbound email. It is on when Supabase isn't configured,
 * or when UIS_DEMO_MODE=true.
 */
export function isDemoMode(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.UIS_DEMO_MODE === "true") return true;
  const hasSupabase = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  if (env.UIS_DEMO_MODE === "false" && !hasSupabase)
    throw new Error(
      "UIS_DEMO_MODE=false but NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set.",
    );
  return !hasSupabase;
}

export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing.");
  return { url, key };
}

/** Environment variables as a plain map (lets tests pass partial environments). */
export type Env = Record<string, string | undefined>;
