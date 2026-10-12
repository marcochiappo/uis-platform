import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/admin/action-form";
import { ProspectStatusSelect } from "@/components/admin/admin-forms";
import { AdminOnly } from "@/components/admin/guard";
import { AffiliationBadge, EmailBadge, OutreachBadge, PipelineBadge, ReviewBadgeR, SourceBadge } from "@/components/admin/recruitment-badges";
import { Alert, Badge, EmptyState, formatDate, PageSkeleton, ReviewBadge } from "@/components/ui";
import {
  affiliationAction,
  approveDraftAction,
  cancelMessageAction,
  createDraftAction,
  doNotContactAction,
  enrichAction,
  linkAccountAction,
  markFailedAction,
  retryMessageAction,
  reviewCandidateAction,
  signalNoteAction,
  updateCandidateAction,
  updateDraftAction,
} from "@/app/recruitment-actions";
import { isDomainError } from "@/lib/domain/errors";
import { approvalProblems } from "@/lib/domain/recruitment";
import type { OutreachMessage, Prospect } from "@/lib/domain/types";
import { getMessages } from "@/lib/i18n";
import { apolloMode, getCandidate, getSendingInfo, type ServiceContext } from "@/lib/services";

export const metadata: Metadata = { title: "Candidate" };

const m = getMessages();

export default function CandidatePage({ params }: PageProps<"/admin/prospects/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminOnly path="/admin/prospects">
        {async (ctx) => {
          const { id } = await params;
          let data;
          try {
            data = await getCandidate(ctx, id);
          } catch (e) {
            if (isDomainError(e) && e.code === "not_found")
              return <EmptyState title="Candidate not found" action={<Link href="/admin/prospects" className="btn-secondary">Back to candidates</Link>} />;
            throw e;
          }
          return <Candidate ctx={ctx} {...data} />;
        }}
      </AdminOnly>
    </Suspense>
  );
}

async function Candidate({
  ctx,
  prospect: p,
  messages,
  suppressed,
  account,
  provider,
}: Awaited<ReturnType<typeof getCandidate>> & { ctx: ServiceContext }) {
  const sending = await getSendingInfo(ctx);
  const apollo = apolloMode(ctx);
  const open = messages.find((x) => x.status === "draft" || x.status === "approved");
  const delivered = messages.find((x) => x.status === "sent" || x.status === "sending");
  const canEnrich = p.reviewStatus === "approved" && !p.enrichedAt && !p.email && !p.doNotContact && apollo.mode !== "unconfigured";

  return (
    <div className="space-y-6">
      <Link href="/admin/prospects" className="link text-sm">
        ← All candidates
      </Link>

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl font-semibold text-brand-900">{p.fullName}</h2>
            <p className="text-muted">{[p.title, p.organization, p.location].filter(Boolean).join(" · ") || "No title, organization or location"}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <SourceBadge source={p.source} />
              <ReviewBadgeR status={p.reviewStatus} />
              <AffiliationBadge value={p.communityAffiliation} />
              <PipelineBadge status={p.status} />
              {p.doNotContact && <Badge tone="danger">Do not contact</Badge>}
            </div>
          </div>
          <dl className="text-sm sm:text-right">
            <dt className="font-semibold">Provenance</dt>
            <dd className="text-muted">{m.recruitment.source[p.source]}{p.sourceRef ? ` · id ${p.sourceRef}` : ""}</dd>
            <dd className="text-muted">Retrieved {formatDate(p.retrievedAt)}</dd>
            {p.sourceDetail && <dd className="max-w-sm text-muted">{p.sourceDetail}</dd>}
          </dl>
        </div>
        {p.notes && <p className="mt-3 text-sm">{p.notes}</p>}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-4" aria-labelledby="review-h">
          <h3 id="review-h" className="font-serif text-xl font-semibold text-brand-900">1. Review</h3>
          <p className="text-sm text-muted">Approve before spending enrichment credits or drafting an invitation.</p>
          {p.reviewNote && <p className="text-sm">Note: {p.reviewNote}</p>}
          <div className="flex flex-wrap gap-3">
            {p.reviewStatus !== "approved" && (
              <ActionForm action={reviewCandidateAction} hidden={{ id: p.id, decision: "approved" }} submitLabel="Approve candidate" className="space-y-2" />
            )}
            {p.reviewStatus !== "rejected" && (
              <ActionForm action={reviewCandidateAction} hidden={{ id: p.id, decision: "rejected" }} submitLabel="Not a fit" buttonClass="btn-danger" className="space-y-2" />
            )}
          </div>
        </section>

        <section className="card space-y-3" aria-labelledby="enrich-h">
          <h3 id="enrich-h" className="font-serif text-xl font-semibold text-brand-900">2. Email address</h3>
          <div className="flex flex-wrap gap-1.5">
            <EmailBadge status={p.emailStatus} />
            <Badge>{m.recruitment.enrichment[p.enrichmentStatus]}</Badge>
          </div>
          <p className="text-sm">
            {p.email ? <span className="font-mono">{p.email}</span> : "No email on file."}
            {p.emailSource && <span className="text-muted"> (from {p.emailSource.replace("_", " ")})</span>}
          </p>
          {p.enrichmentError && <Alert tone="danger">{p.enrichmentError}</Alert>}
          {apollo.mode === "unconfigured" && !p.email && <Alert tone="warning">{apollo.reason}</Alert>}
          {canEnrich ? (
            <ActionForm
              action={enrichAction}
              hidden={{ ids: p.id }}
              submitLabel={apollo.mode === "mock" ? "Retrieve email (MOCK, no credits)" : "Retrieve email (≈1 Apollo credit)"}
              buttonClass="btn-accent"
              pendingLabel="Retrieving…"
              confirm={apollo.mode === "live" ? "This spends about 1 Apollo credit if data is found (0 if not). Continue?" : undefined}
            />
          ) : (
            !p.email && <p className="text-sm text-muted">{p.reviewStatus !== "approved" ? "Approve the candidate first." : p.enrichedAt ? `Enriched on ${formatDate(p.enrichedAt)}.` : ""}</p>
          )}
        </section>
      </div>

      <section className="card space-y-4" aria-labelledby="community-h">
        <h3 id="community-h" className="font-serif text-xl font-semibold text-brand-900">Italian community relevance</h3>
        <Alert tone="info">
          Never infer nationality or community from a name. Only confirm a link when you have supporting information (something the
          person said, a membership, an introduction), and record it. Only a confirmed link is mentioned in invitations.
        </Alert>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h4 className="text-sm font-semibold">Confirmed affiliation</h4>
            <div className="mt-2">
              <AffiliationBadge value={p.communityAffiliation} />
            </div>
            {p.affiliationEvidence && <p className="mt-2 text-sm">Evidence: {p.affiliationEvidence}</p>}
            {p.affiliationReviewedAt && <p className="text-xs text-muted">Reviewed {formatDate(p.affiliationReviewedAt)}</p>}
            <ActionForm action={affiliationAction} hidden={{ id: p.id }} submitLabel="Save community review" buttonClass="btn-secondary" className="mt-4 space-y-3">
              <fieldset className="space-y-1.5 text-sm">
                <legend className="font-semibold">Decision</legend>
                {(["unconfirmed", "confirmed", "not_affiliated"] as const).map((v) => (
                  <label key={v} className="flex items-center gap-2">
                    <input type="radio" name="affiliation" value={v} defaultChecked={p.communityAffiliation === v} className="accent-brand-700" />
                    {m.recruitment.affiliation[v]}
                  </label>
                ))}
              </fieldset>
              <label className="block text-sm">
                <span className="font-semibold">Supporting information</span>
                <span className="block text-muted">Required to confirm. Example: &ldquo;Told us at the alumni event that she grew up in Bologna.&rdquo;</span>
                <textarea name="evidence" rows={2} maxLength={1000} defaultValue={p.affiliationEvidence ?? ""} className="input mt-1" />
              </label>
            </ActionForm>
          </div>
          <div>
            <h4 className="text-sm font-semibold">Unconfirmed signals</h4>
            {p.communitySignals.length === 0 ? (
              <p className="mt-2 text-sm text-muted">None recorded.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {p.communitySignals.map((s, i) => (
                  <li key={i} className="rounded-lg bg-slate-50 px-3 py-2">
                    <span>{s.detail}</span>
                    <span className="block text-xs text-muted">
                      {s.kind} · {s.source} · {formatDate(s.recordedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={signalNoteAction} hidden={{ id: p.id }} submitLabel="Add signal" buttonClass="btn-secondary" className="mt-4 space-y-2">
              <label className="block text-sm">
                <span className="font-semibold">Add an unconfirmed signal</span>
                <input name="note" maxLength={300} className="input mt-1" placeholder="e.g. Member of an Italian professional network (unverified)" />
              </label>
            </ActionForm>
          </div>
        </div>
      </section>

      <section className="card space-y-4" aria-labelledby="outreach" id="outreach">
        <h3 className="font-serif text-xl font-semibold text-brand-900" id="outreach-h">3. Invitation</h3>
        {!sending.live && (
          <Alert tone="warning" title={sending.mode === "mock" ? "Real sending is off (mock adapter active)" : "Real sending is off"}>
            {sending.reasons.join(" ")} Approved messages sent now are only logged by the MOCK adapter and are not delivered.
          </Alert>
        )}
        {suppressed && <Alert tone="danger">This address is on the do-not-contact list.</Alert>}
        {delivered && <Alert tone="success">An invitation has already been {delivered.status === "sent" ? `sent (${formatDate(delivered.sentAt)})` : "submitted"}. Another one can&apos;t be sent.</Alert>}
        {!open && !delivered && !p.doNotContact && (
          <ActionForm action={createDraftAction} hidden={{ prospectId: p.id }} submitLabel="Draft invitation from template" disabled={!p.email} />
        )}
        {!p.email && !delivered && <p className="text-sm text-muted">An email address is needed before drafting.</p>}
        {messages.length > 0 && (
          <ul className="space-y-4">
            {messages.map((msg) => (
              <MessageCard key={msg.id} msg={msg} prospect={p} suppressed={suppressed} live={sending.live} />
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-3" aria-labelledby="pipeline-h">
          <h3 id="pipeline-h" className="font-serif text-xl font-semibold text-brand-900">4. Pipeline</h3>
          <p className="text-sm text-muted">Record replies by hand. Delivery status never counts as a reply.</p>
          <ProspectStatusSelect id={p.id} status={p.status} />
          {account ? (
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <p>
                Linked to UIS account <strong>{account.fullName}</strong> ({account.email}).
              </p>
              <p className="mt-1">
                Mentor profile:{" "}
                {provider ? (
                  <>
                    <ReviewBadge status={provider.reviewStatus} /> {provider.directoryConsent ? "· listed with consent" : "· has not agreed to be listed"}
                  </>
                ) : (
                  "not created yet"
                )}
              </p>
              <p className="mt-1 text-muted">
                They become a listed mentor only after completing the profile, agreeing to be listed and being approved on{" "}
                <Link href="/admin/profiles" className="link">
                  Profile review
                </Link>
                .
              </p>
            </div>
          ) : (
            p.email && (
              <ActionForm action={linkAccountAction} hidden={{ id: p.id }} submitLabel="Link to UIS account with this email" buttonClass="btn-secondary" />
            )
          )}
        </section>

        <section className="card space-y-3" aria-labelledby="details-h">
          <h3 id="details-h" className="font-serif text-xl font-semibold text-brand-900">Details</h3>
          <p className="text-sm text-muted">Invitations are personalised only with these fields. Correct anything you can&apos;t verify.</p>
          <ActionForm action={updateCandidateAction} hidden={{ id: p.id }} submitLabel="Save details" buttonClass="btn-secondary">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input name="fullName" label="Full name" defaultValue={p.fullName} required />
              <Input name="email" label="Email" defaultValue={p.email ?? ""} type="email" />
              <Input name="title" label="Title" defaultValue={p.title ?? ""} />
              <Input name="organization" label="Organization" defaultValue={p.organization ?? ""} />
              <div className="sm:col-span-2">
                <Input name="expertise" label="Expertise" defaultValue={p.expertise ?? ""} />
              </div>
            </div>
          </ActionForm>
          <div className="border-t border-line pt-3">
            {p.doNotContact ? (
              <ActionForm action={doNotContactAction} hidden={{ id: p.id, on: "false" }} submitLabel="Remove do-not-contact flag" buttonClass="btn-secondary" />
            ) : (
              <ActionForm
                action={doNotContactAction}
                hidden={{ id: p.id, on: "true" }}
                submitLabel="Mark do not contact"
                buttonClass="btn-danger"
                confirm="Add this person to the do-not-contact list and cancel any unsent drafts?"
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Input({ name, label, defaultValue, type = "text", required }: { name: string; label: string; defaultValue: string; type?: string; required?: boolean }) {
  return (
    <label className="block text-sm">
      <span className="font-semibold">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue} required={required} maxLength={300} className="input mt-1" />
    </label>
  );
}

function MessageCard({ msg, prospect, suppressed, live }: { msg: OutreachMessage; prospect: Prospect; suppressed: boolean; live: boolean }) {
  const editable = msg.status === "draft" || msg.status === "approved";
  const problems = editable ? approvalProblems({ message: msg, prospect, suppressed, live }) : [];
  return (
    <li className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <OutreachBadge status={msg.status} />
        <span className="text-muted">
          To <span className="font-mono">{msg.recipient ?? "—"}</span> · created {formatDate(msg.createdAt)}
          {msg.attemptCount > 0 && ` · ${msg.attemptCount} attempt(s)`}
          {msg.sentAt && ` · sent ${formatDate(msg.sentAt)}`}
        </span>
      </div>
      {msg.lastError && <p className="mt-2 text-sm text-red-800">{msg.lastError}</p>}
      {editable ? (
        <div className="mt-3 space-y-3">
          <ActionForm action={updateDraftAction} hidden={{ id: msg.id }} submitLabel="Save draft" buttonClass="btn-secondary" key={msg.updatedAt}>
            <label className="block text-sm">
              <span className="font-semibold">Subject</span>
              <input name="subject" defaultValue={msg.subject} maxLength={300} className="input mt-1" />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Message</span>
              <span className="block text-muted">
                Keep <code>{"{{signup_link}}"}</code> and <code>{"{{unsubscribe_link}}"}</code>; personal links are added when it&apos;s sent.
                Saving revokes any approval.
              </span>
              <textarea name="body" defaultValue={msg.body} rows={14} maxLength={10000} className="input mt-1 font-mono text-sm" />
            </label>
          </ActionForm>
          {msg.status === "draft" &&
            (problems.length ? (
              <Alert tone="warning" title="Fix before approving">
                <ul className="list-disc pl-5">
                  {problems.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </Alert>
            ) : (
              <ActionForm
                action={approveDraftAction}
                hidden={{ id: msg.id }}
                submitLabel={`Approve recipient (${msg.recipient}) and final message`}
                confirm={`Approve sending this exact message to ${msg.recipient}?`}
              />
            ))}
          {msg.status === "approved" && <Alert tone="info">Approved. It will be sent with the next batch from the Outreach queue.</Alert>}
          <ActionForm action={cancelMessageAction} hidden={{ id: msg.id }} submitLabel="Cancel this message" buttonClass="btn-danger" />
        </div>
      ) : (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted">Show message</summary>
          <p className="mt-2 font-semibold">{msg.subject}</p>
          <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans">{msg.body}</pre>
        </details>
      )}
      {msg.status === "failed" && <ActionForm action={retryMessageAction} hidden={{ id: msg.id }} submitLabel="Retry sending" className="mt-3 space-y-2" />}
      {msg.status === "sending" && (
        <ActionForm action={markFailedAction} hidden={{ id: msg.id }} submitLabel="Mark as failed" buttonClass="btn-danger" className="mt-3 space-y-2">
          <p className="text-sm text-muted">
            The send outcome wasn&apos;t recorded. Check the email provider first: if it was delivered, don&apos;t retry.
          </p>
          <input name="note" maxLength={300} placeholder="What you checked" className="input" />
        </ActionForm>
      )}
    </li>
  );
}
