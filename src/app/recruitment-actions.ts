"use server";

import { refresh } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { isDomainError } from "@/lib/domain/errors";
import type { ApolloSearchParams, ApolloSearchPerson } from "@/lib/recruitment/apollo";
import { getContext } from "@/lib/server";
import * as svc from "@/lib/services";

// Every action re-resolves the session; the service functions enforce admin access.

async function run(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e);
    if (isDomainError(e)) return { status: "error", message: e.message };
    console.error(e);
    return { status: "error", message: "Something went wrong. Please try again." };
  }
}

const id = z.string().min(1).max(100);
const opt = (max: number) => z.string().trim().max(max).optional();
const ok = (message: string, data?: unknown): ActionState => {
  refresh();
  return { status: "success", message, data };
};
const bad = (message = "Invalid input."): ActionState => ({ status: "error", message });

export async function reviewCandidateAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const p = z.object({ id, decision: z.enum(["approved", "rejected"]), note: opt(500) }).safeParse(Object.fromEntries(fd));
    if (!p.success) return bad();
    await svc.reviewCandidate(await getContext(), p.data.id, p.data.decision, p.data.note ?? null);
    return ok(p.data.decision === "approved" ? "Approved for enrichment and outreach." : "Marked as not a fit.");
  });
}

export async function updateCandidateAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const p = z
      .object({ id, fullName: z.string().trim().min(1).max(120), email: opt(200), title: opt(200), organization: opt(160), expertise: opt(300) })
      .safeParse(Object.fromEntries(fd));
    if (!p.success) return bad("Check the fields and try again.");
    const { id: cid, ...rest } = p.data;
    await svc.updateCandidateDetails(await getContext(), cid, { ...rest, email: rest.email ?? null });
    return ok("Candidate details saved.");
  });
}

export async function setProspectStatusAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const p = z.object({ id, status: z.enum(["new", "invited", "interested", "declined", "joined"]) }).safeParse(Object.fromEntries(fd));
    if (!p.success) return bad("Invalid status.");
    await svc.setCandidateStatus(await getContext(), p.data.id, p.data.status);
    return ok("Status updated.");
  });
}

export async function affiliationAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const p = z.object({ id, affiliation: z.enum(["unconfirmed", "confirmed", "not_affiliated"]), evidence: opt(1000) }).safeParse(Object.fromEntries(fd));
    if (!p.success) return bad();
    await svc.setAffiliation(await getContext(), p.data.id, p.data.affiliation, p.data.evidence ?? null);
    return ok("Community relevance updated.");
  });
}

export async function signalNoteAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const p = z.object({ id, note: z.string().trim().min(1).max(300) }).safeParse(Object.fromEntries(fd));
    if (!p.success) return bad("Write a note (up to 300 characters).");
    await svc.addSignalNote(await getContext(), p.data.id, p.data.note);
    return ok("Unconfirmed signal recorded.");
  });
}

export async function doNotContactAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const p = z.object({ id, on: z.enum(["true", "false"]), note: opt(300) }).safeParse(Object.fromEntries(fd));
    if (!p.success) return bad();
    await svc.setDoNotContact(await getContext(), p.data.id, p.data.on === "true", p.data.note ?? null);
    return ok(p.data.on === "true" ? "Marked do-not-contact. Open drafts were cancelled." : "Do-not-contact flag removed (the address stays on the list until removed there).");
  });
}

export async function linkAccountAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const p = z.object({ id }).safeParse(Object.fromEntries(fd));
    if (!p.success) return bad();
    await svc.linkCandidateAccount(await getContext(), p.data.id);
    return ok("Linked to the candidate's UIS account. They still need a mentor profile and UIS approval to be listed.");
  });
}

const personSchema = z.object({
  id: z.string().min(1).max(100),
  displayName: z.string().min(1).max(120),
  title: z.string().max(200).nullable(),
  organization: z.string().max(160).nullable(),
  hasEmail: z.boolean(),
});
const criteriaSchema = z.object({
  keywords: z.string().max(200).optional(),
  titles: z.array(z.string().max(100)).max(10).optional(),
  organizationDomains: z.array(z.string().max(100)).max(10).optional(),
  locations: z.array(z.string().max(100)).max(10).optional(),
});

export async function saveCandidatesAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const people = z.array(personSchema).safeParse(fd.getAll("person").map((v) => JSON.parse(String(v))));
    const criteria = criteriaSchema.safeParse(JSON.parse(String(fd.get("criteria") ?? "{}")));
    if (!people.success || !criteria.success) return bad("Invalid selection.");
    if (people.data.length === 0) return bad("Select at least one person.");
    const res = await svc.saveApolloCandidates(await getContext(), people.data as ApolloSearchPerson[], criteria.data as ApolloSearchParams);
    return ok(`${res.inserted} candidate${res.inserted === 1 ? "" : "s"} saved${res.duplicates ? `, ${res.duplicates} already saved` : ""}. Review them before enriching.`);
  });
}

export async function enrichAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ids = z.array(id).safeParse(fd.getAll("ids"));
    if (!ids.success || ids.data.length === 0) return bad("Select at least one candidate.");
    const report = await svc.enrichCandidates(await getContext(), ids.data);
    refresh();
    const found = report.results.filter((r) => r.outcome.startsWith("Email found")).length;
    return {
      status: report.stopped ? "error" : "success",
      message: report.stopped ? `Apollo stopped the batch: ${report.stopped.message}` : `Enrichment finished: ${found} email${found === 1 ? "" : "s"} found.`,
      data: report,
    };
  });
}

export async function createDraftAction(_: ActionState, fd: FormData) {
  let target: string | null = null;
  const state = await run(async () => {
    const p = z.object({ prospectId: id }).safeParse(Object.fromEntries(fd));
    if (!p.success) return bad();
    const { message } = await svc.createDraft(await getContext(), p.data.prospectId);
    target = `/admin/prospects/${p.data.prospectId}?draft=${message.id}#outreach`;
    return { status: "success" };
  });
  if (target) redirect(target);
  return state;
}

export async function updateDraftAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const p = z.object({ id, subject: z.string().max(300), body: z.string().max(10_000) }).safeParse(Object.fromEntries(fd));
    if (!p.success) return bad("The message is too long.");
    await svc.updateDraft(await getContext(), p.data.id, { subject: p.data.subject, body: p.data.body });
    return ok("Draft saved. Approve it again before sending.");
  });
}

export async function approveDraftAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const p = z.object({ id }).safeParse(Object.fromEntries(fd));
    if (!p.success) return bad();
    await svc.approveDraft(await getContext(), p.data.id);
    return ok("Recipient and message approved. It will go out with the next batch.");
  });
}

export async function cancelMessageAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const p = z.object({ id }).safeParse(Object.fromEntries(fd));
    if (!p.success) return bad();
    await svc.cancelMessage(await getContext(), p.data.id);
    return ok("Message cancelled.");
  });
}

export async function sendBatchAction() {
  return run(async () => {
    const r = await svc.sendApprovedBatch(await getContext());
    refresh();
    if (r.results.length === 0) return { status: "error", message: "There are no approved messages to send." };
    const count = (o: string) => r.results.filter((x) => x.outcome === o).length;
    const parts = [
      count("sent") && `${count("sent")} sent`,
      count("mock_logged") && `${count("mock_logged")} logged by the MOCK adapter (not delivered)`,
      count("failed") && `${count("failed")} failed`,
      count("skipped") && `${count("skipped")} skipped`,
      count("unknown") && `${count("unknown")} with unknown outcome`,
    ].filter(Boolean);
    return { status: count("failed") || count("unknown") ? "error" : "success", message: `${parts.join(", ")}.`, data: r };
  });
}

export async function retryMessageAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const p = z.object({ id }).safeParse(Object.fromEntries(fd));
    if (!p.success) return bad();
    const r = await svc.retryFailedMessage(await getContext(), p.data.id);
    refresh();
    return { status: r.outcome === "sent" || r.outcome === "mock_logged" ? "success" : "error", message: r.detail };
  });
}

export async function markFailedAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const p = z.object({ id, note: z.string().trim().max(300) }).safeParse(Object.fromEntries(fd));
    if (!p.success) return bad();
    await svc.markSendingFailed(await getContext(), p.data.id, p.data.note);
    return ok("Marked as failed. You can retry it now.");
  });
}

export async function saveSettingsAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const p = z
      .object({ subjectTemplate: z.string().max(300), bodyTemplate: z.string().max(10_000), batchLimit: z.coerce.number().int().min(1).max(50) })
      .safeParse(Object.fromEntries(fd));
    if (!p.success) return bad("Batch limit must be between 1 and 50, and templates within length limits.");
    await svc.saveOutreachSettings(await getContext(), { ...p.data, sendingEnabled: fd.get("sendingEnabled") === "on" });
    return ok("Settings saved.");
  });
}

export async function addSuppressionAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const p = z.object({ email: z.string().max(200), note: opt(300) }).safeParse(Object.fromEntries(fd));
    if (!p.success) return bad();
    await svc.addSuppression(await getContext(), p.data.email, p.data.note ?? null);
    return ok("Added to the do-not-contact list.");
  });
}

export async function removeSuppressionAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const p = z.object({ id }).safeParse(Object.fromEntries(fd));
    if (!p.success) return bad();
    await svc.removeSuppression(await getContext(), p.data.id);
    return ok("Removed from the do-not-contact list.");
  });
}
