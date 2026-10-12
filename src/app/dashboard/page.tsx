import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton, SignInRequired } from "@/components/ui";
import { getContext } from "@/lib/server";
import { getMyProfiles } from "@/lib/services";

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Route />
    </Suspense>
  );
}

/** Sends people to the most relevant home for the profiles they have. */
async function Route(): Promise<React.ReactNode> {
  const ctx = await getContext();
  if (!ctx.actor) return <SignInRequired next="/dashboard" />;
  const { student, provider } = await getMyProfiles(ctx);
  if (ctx.actor.role === "admin" && !student && !provider) redirect("/admin");
  if (student) redirect("/student");
  if (provider) redirect("/mentor");
  redirect("/onboarding");
}
