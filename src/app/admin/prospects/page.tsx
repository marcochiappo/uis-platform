import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/admin/action-form";
import { AdminOnly } from "@/components/admin/guard";
import { AffiliationBadge, EmailBadge, OutreachBadge, PipelineBadge, ReviewBadgeR, SourceBadge } from "@/components/admin/recruitment-badges";
import { Alert, EmptyState, formatDate, PageSkeleton } from "@/components/ui";
import { enrichAction } from "@/app/recruitment-actions";
import type { ProspectReview, ProspectStatus } from "@/lib/domain/types";
import { getMessages } from "@/lib/i18n";
import { apolloMode, listCandidates } from "@/lib/services";

export const metadata: Metadata = { title: "Recruitment candidates" };

const m = getMessages();
const STATUSES = Object.keys(m.prospectStatus) as ProspectStatus[];
const REVIEWS = Object.keys(m.recruitment.review) as ProspectReview[];

export default function CandidatesPage({ searchParams }: PageProps<"/admin/prospects">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminOnly path="/admin/prospects">
        {async (ctx) => {
          const [{ status, review }, rows] = await Promise.all([searchParams, listCandidates(ctx)]);
          const apollo = apolloMode(ctx);
          const filtered = rows.filter(
            (r) => (!status || r.prospect.status === status) && (!review || r.prospect.reviewStatus === review),
          );
          const enrichable = (r: (typeof rows)[number]) =>
            r.prospect.reviewStatus === "approved" && !r.prospect.enrichedAt && !r.prospect.email && !r.prospect.doNotContact;
          return (
            <div className="space-y-6">
              <form className="flex flex-wrap items-end gap-3" method="get">
                <label className="text-sm">
                  <span className="block font-semibold">Pipeline status</span>
                  <select name="status" defaultValue={typeof status === "string" ? status : ""} className="input mt-1 py-1.5">
                    <option value="">All</option>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {m.prospectStatus[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="block font-semibold">Review</span>
                  <select name="review" defaultValue={typeof review === "string" ? review : ""} className="input mt-1 py-1.5">
                    <option value="">All</option>
                    {REVIEWS.map((s) => (
                      <option key={s} value={s}>
                        {m.recruitment.review[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="btn-secondary">
                  Filter
                </button>
                <span className="ml-auto text-sm text-muted">
                  {filtered.length} of {rows.length} candidates
                </span>
              </form>

              {rows.length === 0 ? (
                <EmptyState
                  title="No candidates yet"
                  action={
                    <div className="flex gap-2">
                      <Link href="/admin/prospects/search" className="btn-primary">
                        Search Apollo
                      </Link>
                      <Link href="/admin/prospects/import" className="btn-secondary">
                        Import CSV
                      </Link>
                    </div>
                  }
                >
                  Save people from an Apollo search or upload a CSV of manually selected contacts.
                </EmptyState>
              ) : filtered.length === 0 ? (
                <EmptyState title="No candidates match these filters" />
              ) : (
                <ActionForm
                  action={enrichAction}
                  submitLabel={apollo.mode === "mock" ? "Enrich selected (MOCK, no credits)" : "Enrich selected (uses Apollo credits)"}
                  pendingLabel="Enriching…"
                  buttonClass="btn-accent"
                  disabled={apollo.mode === "unconfigured"}
                  confirm={apollo.mode === "live" ? "Enrichment spends Apollo credits: about 1 credit per person when an email or profile data is returned, 0 when nothing is found. Continue?" : undefined}
                >
                  {apollo.mode === "unconfigured" && <Alert tone="warning" title="Apollo isn't configured">{apollo.reason}</Alert>}
                  {apollo.mode === "mock" && (
                    <Alert tone="warning" title="Apollo MOCK adapter">
                      Enrichment returns fictional data at reserved .example domains. No credits are used and nothing can be emailed for real.
                    </Alert>
                  )}
                  <p className="text-sm text-muted">
                    Only candidates you&apos;ve approved in review, who don&apos;t have an email yet and haven&apos;t been enriched,
                    can be selected. Up to 10 at a time.
                  </p>
                  <div className="card overflow-x-auto p-0 sm:p-0">
                    <table className="w-full min-w-[60rem] text-left text-sm">
                      <caption className="sr-only">Recruitment candidates</caption>
                      <thead className="border-b border-line bg-slate-50 text-muted">
                        <tr>
                          <th scope="col" className="w-10 px-3 py-3">
                            <span className="sr-only">Select for enrichment</span>
                          </th>
                          <th scope="col" className="px-3 py-3 font-semibold">Candidate</th>
                          <th scope="col" className="px-3 py-3 font-semibold">Email</th>
                          <th scope="col" className="px-3 py-3 font-semibold">Review & community</th>
                          <th scope="col" className="px-3 py-3 font-semibold">Pipeline</th>
                          <th scope="col" className="px-3 py-3 font-semibold">Retrieved</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((r) => {
                          const p = r.prospect;
                          return (
                            <tr key={p.id} className="border-b border-line align-top last:border-0">
                              <td className="px-3 py-3">
                                <input
                                  type="checkbox"
                                  name="ids"
                                  value={p.id}
                                  disabled={!enrichable(r)}
                                  aria-label={`Select ${p.fullName} for enrichment`}
                                  className="size-4 accent-brand-700"
                                />
                              </td>
                              <td className="px-3 py-3">
                                <Link href={`/admin/prospects/${p.id}`} className="link font-semibold">
                                  {p.fullName}
                                </Link>
                                <p className="text-muted">{[p.title, p.organization].filter(Boolean).join(" · ") || "No title or organization"}</p>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  <SourceBadge source={p.source} />
                                  {p.doNotContact && <span className="text-xs font-semibold text-red-700">Do not contact</span>}
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <EmailBadge status={p.emailStatus} />
                              </td>
                              <td className="space-y-1 px-3 py-3">
                                <div>
                                  <ReviewBadgeR status={p.reviewStatus} />
                                </div>
                                <div>
                                  <AffiliationBadge value={p.communityAffiliation} />
                                </div>
                                {p.communityAffiliation === "unconfirmed" && p.communitySignals.length > 0 && (
                                  <p className="text-xs text-muted">{p.communitySignals.length} unconfirmed signal(s)</p>
                                )}
                              </td>
                              <td className="space-y-1 px-3 py-3">
                                <div>
                                  <PipelineBadge status={p.status} />
                                </div>
                                {r.latestMessage && (
                                  <div>
                                    <OutreachBadge status={r.latestMessage.status} />
                                  </div>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-3 py-3 text-muted">{formatDate(p.retrievedAt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </ActionForm>
              )}
            </div>
          );
        }}
      </AdminOnly>
    </Suspense>
  );
}
