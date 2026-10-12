import type { Metadata } from "next";
import { Suspense } from "react";
import { ReviewForm } from "@/components/admin/admin-forms";
import { AdminOnly } from "@/components/admin/guard";
import { Badge, DemoBadge, EmptyState, formatDate, PageHeader, PageSkeleton, ReviewBadge, TagList } from "@/components/ui";
import { getMessages, slotLabel } from "@/lib/i18n";
import { adminListProviders, adminListStudents } from "@/lib/services";

export const metadata: Metadata = { title: "Profile review" };

const m = getMessages();

export default function AdminProfilesPage() {
  return (
    <>
      <PageHeader
        eyebrow="UIS admin"
        title="Profile review"
        description="Only approved mentors and tutors who gave directory permission can be matched with students."
      />
      <Suspense fallback={<PageSkeleton />}>
        <AdminOnly path="/admin/profiles">
          {async (ctx) => {
            const [providers, students] = await Promise.all([adminListProviders(ctx), adminListStudents(ctx)]);
            return (
              <div className="space-y-12">
                <section aria-labelledby="providers-h">
                  <h2 id="providers-h" className="mb-4 font-serif text-2xl font-semibold text-brand-900">
                    Mentors & tutors ({providers.length})
                  </h2>
                  {providers.length === 0 ? (
                    <EmptyState title="No mentor or tutor profiles yet" />
                  ) : (
                    <ul className="space-y-4">
                      {providers.map(({ provider: p, account }) => (
                        <li key={p.userId} className="card">
                          <details open={p.reviewStatus === "pending"}>
                            <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                              <span className="font-semibold">{p.fullName}</span>
                              <ReviewBadge status={p.reviewStatus} />
                              {p.offersMentoring && <Badge tone="brand">{m.services.mentoring}</Badge>}
                              {p.offersTutoring && <Badge tone="warning">{m.services.tutoring}</Badge>}
                              {!p.directoryConsent && <Badge>Hidden from directory</Badge>}
                              {p.isPaused && <Badge tone="danger">Paused</Badge>}
                              <DemoBadge show={p.isDemo} />
                              <span className="ml-auto text-sm text-muted">
                                {p.activeCount}/{p.maxActiveMentees} active · updated {formatDate(p.updatedAt)}
                              </span>
                            </summary>
                            <div className="mt-4 grid gap-6 lg:grid-cols-[2fr_1fr]">
                              <div className="space-y-3 text-sm">
                                {p.headline && <p className="font-medium">{p.headline}</p>}
                                <p>{p.bio}</p>
                                <dl className="grid gap-3 sm:grid-cols-2">
                                  <Item label="Email (private)">{account?.email ?? "—"}</Item>
                                  <Item label="LinkedIn (private)">
                                    {account?.linkedinUrl ? (
                                      <a className="link break-all" href={account.linkedinUrl} target="_blank" rel="noopener noreferrer">
                                        {account.linkedinUrl}
                                      </a>
                                    ) : (
                                      "—"
                                    )}
                                  </Item>
                                  {p.offersTutoring && (
                                    <>
                                      <Item label="Tutors">
                                        <TagList items={p.tutoringSubjects.map((s) => m.subjects[s])} />
                                      </Item>
                                      <Item label="Levels">
                                        <TagList items={p.teachingLevels.map((l) => m.levels[l])} />
                                      </Item>
                                    </>
                                  )}
                                  {p.offersMentoring && (
                                    <Item label="Mentoring topics">
                                      <TagList items={p.mentoringTopics.map((g) => m.goals[g])} />
                                    </Item>
                                  )}
                                  <Item label={`Career (${p.yearsExperience} yrs)`}>
                                    <TagList items={p.careerAreas.map((c) => m.careerAreas[c])} />
                                  </Item>
                                  <Item label="Languages">
                                    <TagList items={p.languages.map((l) => m.languages[l])} />
                                  </Item>
                                  <Item label={`Availability (${p.timeZone})`}>
                                    <TagList items={p.availability.map((s) => slotLabel(m, s))} />
                                  </Item>
                                </dl>
                                {p.careerExperience && <p className="text-muted">{p.careerExperience}</p>}
                                {p.reviewNote && <p className="text-muted">Review note: {p.reviewNote}</p>}
                              </div>
                              <ReviewForm userId={p.userId} current={p.reviewStatus} />
                            </div>
                          </details>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section aria-labelledby="students-h" id="students">
                  <h2 id="students-h" className="mb-4 font-serif text-2xl font-semibold text-brand-900">
                    Students ({students.length})
                  </h2>
                  {students.length === 0 ? (
                    <EmptyState title="No student profiles yet" />
                  ) : (
                    <div className="card overflow-x-auto p-0 sm:p-0">
                      <table className="w-full min-w-[40rem] text-left text-sm">
                        <caption className="sr-only">Student profiles</caption>
                        <thead className="border-b border-line bg-slate-50 text-muted">
                          <tr>
                            <th scope="col" className="px-4 py-3 font-semibold">Name</th>
                            <th scope="col" className="px-4 py-3 font-semibold">Email (private)</th>
                            <th scope="col" className="px-4 py-3 font-semibold">Studies</th>
                            <th scope="col" className="px-4 py-3 font-semibold">Seeking</th>
                          </tr>
                        </thead>
                        <tbody>
                          {students.map(({ student: s, account }) => (
                            <tr key={s.userId} className="border-b border-line last:border-0">
                              <td className="px-4 py-3 font-medium">
                                {s.fullName} <DemoBadge show={s.isDemo} />
                              </td>
                              <td className="px-4 py-3">{account?.email ?? "—"}</td>
                              <td className="px-4 py-3">
                                {s.degree}, {m.levels[s.degreeLevel]} · {s.university}
                              </td>
                              <td className="px-4 py-3">{m.seeking[s.seeking]}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            );
          }}
        </AdminOnly>
      </Suspense>
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-semibold">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
