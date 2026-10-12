import "server-only";
import { cookies } from "next/headers";
import path from "node:path";
import { decodeDemoSession, DEMO_COOKIE } from "./auth/demo-session";
import { isDemoMode } from "./config";
import { DemoStore } from "./data/demo-store";
import { SupabaseStore } from "./data/supabase-store";
import type { DataStore } from "./data/store";
import type { Actor } from "./domain/types";
import { createMailer } from "./email";
import { apolloConfig } from "./recruitment/apollo";
import type { ServiceContext } from "./services";
import { createClient } from "./supabase/server";

// One demo store per server process, persisted to a local JSON file.
const globalForDemo = globalThis as unknown as { __uisDemoStore?: DemoStore };

export function getDemoStore(): DemoStore {
  globalForDemo.__uisDemoStore ??= new DemoStore({
    file: process.env.DEMO_DATA_FILE || path.join(process.cwd(), ".demo-data", "db.json"),
  });
  return globalForDemo.__uisDemoStore;
}

async function resolve(): Promise<{ store: DataStore; actor: Actor | null }> {
  if (isDemoMode()) {
    const store = getDemoStore();
    const userId = decodeDemoSession((await cookies()).get(DEMO_COOKIE)?.value);
    const account = userId ? await store.getAccount(userId) : null;
    return {
      store,
      actor: account
        ? { userId: account.id, email: account.email, fullName: account.fullName, role: account.role }
        : null,
    };
  }
  const sb = await createClient();
  const store = new SupabaseStore(sb);
  const { data } = await sb.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return { store, actor: null };
  // Role comes from the database row, never from the JWT's user metadata.
  const account = await store.getAccount(sub);
  return {
    store,
    actor: account
      ? { userId: account.id, email: account.email, fullName: account.fullName, role: account.role }
      : null,
  };
}

/** Build the per-request service context. Call inside a Suspense boundary or a server action. */
export async function getContext(): Promise<ServiceContext> {
  const { store, actor } = await resolve();
  return {
    store,
    actor,
    mailer: createMailer({
      demo: isDemoMode(),
      store,
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM,
    }),
    recruitment: { apollo: apolloConfig(process.env, isDemoMode()), env: process.env, demo: isDemoMode() },
  };
}

/** Store for public, token-based requests (unsubscribe) — anonymous in Supabase mode. */
export async function getPublicStore(): Promise<DataStore> {
  return isDemoMode() ? getDemoStore() : new SupabaseStore(await createClient());
}
