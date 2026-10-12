import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm } from "@/components/admin/action-form";
import { AdminOnly } from "@/components/admin/guard";
import { Alert, Badge, EmptyState, PageSkeleton } from "@/components/ui";
import { saveCandidatesAction } from "@/app/recruitment-actions";
import type { ApolloSearchParams } from "@/lib/recruitment/apollo";
import { apolloMode, searchApollo } from "@/lib/services";

export const metadata: Metadata = { title: "Apollo search" };

const list = (v: string | string[] | undefined) =>
  (typeof v === "string" ? v : "")
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 10);

export default function SearchPage({ searchParams }: PageProps<"/admin/prospects/search">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminOnly path="/admin/prospects/search">
        {async (ctx) => {
          const sp = await searchParams;
          const apollo = apolloMode(ctx);
          const value = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
          const criteria: ApolloSearchParams = {
            keywords: value("expertise").trim().slice(0, 200) || undefined,
            titles: list(sp.role),
            organizationDomains: list(sp.org),
            locations: list(sp.location),
            page: Math.max(1, Math.min(500, Number(value("page")) || 1)),
            perPage: 25,
          };
          const searched = Boolean(value("expertise") || value("role") || value("org") || value("location"));
          const result = searched ? await searchApollo(ctx, criteria) : null;
          return (
            <div className="space-y-6">
              {apollo.mode === "unconfigured" && <Alert tone="warning" title="Apollo isn't configured">{apollo.reason}</Alert>}
              {apollo.mode === "mock" && (
                <Alert tone="warning" title="MOCK Apollo adapter (local development)">
                  Results are fictional and saved with the source &ldquo;Apollo MOCK&rdquo;. They can never be emailed for real. Add{" "}
                  <code>mock:credits</code>, <code>mock:rate</code> or <code>mock:auth</code> to the expertise field to see how errors are shown.
                </Alert>
              )}
              <form method="get" className="card grid gap-4 sm:grid-cols-2">
                <Field name="expertise" label="Expertise (keywords)" hint="e.g. machine learning" defaultValue={value("expertise")} />
                <Field name="role" label="Role / job titles" hint="Comma-separated, e.g. professor, engineering manager" defaultValue={value("role")} />
                <Field name="org" label="Organization domains" hint="Comma-separated, e.g. example.com. Apollo filters organizations by domain." defaultValue={value("org")} />
                <Field name="location" label="Person location" hint="e.g. Italy, Milan, London" defaultValue={value("location")} />
                <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                  <button type="submit" className="btn-primary" disabled={apollo.mode === "unconfigured"}>
                    Search
                  </button>
                  <p className="text-sm text-muted">
                    Search uses no Apollo credits and returns no email addresses. Location describes where someone is, not their nationality.
                  </p>
                </div>
              </form>

              {result && !result.ok && (
                <Alert tone="danger" title={errorTitle(result.kind)}>
                  {result.message}
                </Alert>
              )}
              {result?.ok && result.value.people.length === 0 && <EmptyState title="No people match these filters">Try broader keywords or fewer filters.</EmptyState>}
              {result?.ok && result.value.people.length > 0 && (
                <ActionForm action={saveCandidatesAction} submitLabel="Save selected as candidates" pendingLabel="Saving…" hidden={{ criteria: JSON.stringify(criteria) }}>
                  <p className="text-sm text-muted">
                    {result.value.total.toLocaleString("en-GB")} matches · page {result.value.page}. Surnames are partly hidden by Apollo until enrichment.
                  </p>
                  <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
                    {result.value.people.map((p) => {
                      const saved = result.value.savedIds.includes(p.id);
                      return (
                        <li key={p.id} className="flex items-start gap-3 px-4 py-3">
                          <input
                            type="checkbox"
                            name="person"
                            value={JSON.stringify(p)}
                            disabled={saved}
                            aria-label={`Select ${p.displayName}`}
                            className="mt-1 size-4 accent-brand-700"
                          />
                          <div className="min-w-0 flex-1 text-sm">
                            <p className="font-semibold">
                              {p.displayName} {result.value.mode === "mock" && <Badge tone="danger">MOCK</Badge>}
                            </p>
                            <p className="text-muted">{[p.title, p.organization].filter(Boolean).join(" · ") || "No title or organization"}</p>
                          </div>
                          <div className="shrink-0 text-right text-xs text-muted">
                            {saved ? <Badge tone="success">Saved</Badge> : p.hasEmail ? "Email on file at Apollo" : "No email at Apollo"}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <Pager page={result.value.page} total={result.value.total} perPage={result.value.perPage} sp={sp} />
                </ActionForm>
              )}
            </div>
          );
        }}
      </AdminOnly>
    </Suspense>
  );
}

function errorTitle(kind: string) {
  return (
    {
      missing_credentials: "Apollo isn't configured",
      unauthorized: "Apollo rejected the API key",
      forbidden: "API key not permitted",
      credits_exhausted: "Out of Apollo credits",
      rate_limited: "Apollo rate limit reached",
      invalid_request: "Search couldn't run",
    } as Record<string, string>
  )[kind] ?? "Apollo is unavailable";
}

function Field({ name, label, hint, defaultValue }: { name: string; label: string; hint: string; defaultValue: string }) {
  return (
    <label className="block text-sm">
      <span className="font-semibold">{label}</span>
      <span className="block text-muted">{hint}</span>
      <input name={name} defaultValue={defaultValue} maxLength={200} className="input mt-1.5" />
    </label>
  );
}

function Pager({ page, total, perPage, sp }: { page: number; total: number; perPage: number; sp: Record<string, string | string[] | undefined> }) {
  const last = Math.min(500, Math.ceil(total / perPage));
  if (last <= 1) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "page") q.set(k, v);
    q.set("page", String(p));
    return `?${q}`;
  };
  return (
    <nav aria-label="Search results pages" className="flex items-center gap-3 text-sm">
      {page > 1 && (
        <a className="link" href={href(page - 1)}>
          Previous
        </a>
      )}
      <span className="text-muted">
        Page {page} of {last}
      </span>
      {page < last && (
        <a className="link" href={href(page + 1)}>
          Next
        </a>
      )}
    </nav>
  );
}
