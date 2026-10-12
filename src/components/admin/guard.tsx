import type { ReactNode } from "react";
import { Forbidden, SignInRequired } from "@/components/ui";
import { getContext } from "@/lib/server";
import type { ServiceContext } from "@/lib/services";

/**
 * Renders `children(ctx)` only for admins. This is a UX guard; every admin
 * service function re-checks the role, and RLS enforces it in Supabase.
 */
export async function AdminOnly({ path, children }: { path: string; children: (ctx: ServiceContext) => Promise<ReactNode> }) {
  const ctx = await getContext();
  if (!ctx.actor) return <SignInRequired next={path} />;
  if (ctx.actor.role !== "admin") return <Forbidden>This area is for UIS administrators only.</Forbidden>;
  return <>{await children(ctx)}</>;
}
