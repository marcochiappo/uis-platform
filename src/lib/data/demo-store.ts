import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DomainError } from "../domain/errors";
import { CAPACITY_STATUSES, OPEN_STATUSES } from "../domain/requests";
import { buildProspect, normalizeEmail } from "../domain/recruitment";
import type {
  Account,
  EmailRecord,
  IntroRequest,
  OutreachMessage,
  OutreachSettings,
  OutreachStatus,
  Prospect,
  ProspectPatch,
  ProviderProfile,
  RequestEvent,
  Suppression,
} from "../domain/types";
import {
  seedAccounts,
  seedEvents,
  seedProspects,
  seedProviders,
  seedRequests,
  seedStudents,
} from "./seed";
import type { DataStore } from "./store";

export interface DemoDb {
  version: 2;
  accounts: Account[];
  students: import("../domain/types").StudentProfile[];
  /** `activeCount` is derived from requests on read and not trusted from disk. */
  providers: ProviderProfile[];
  requests: IntroRequest[];
  events: RequestEvent[];
  prospects: Prospect[];
  emails: EmailRecord[];
  outreach: OutreachMessage[];
  suppressions: Suppression[];
  outreachSettings: OutreachSettings | null;
}

export function createSeedDb(): DemoDb {
  return structuredClone({
    version: 2 as const,
    accounts: seedAccounts,
    students: seedStudents,
    providers: seedProviders,
    requests: seedRequests,
    events: seedEvents,
    prospects: seedProspects,
    emails: [],
    outreach: [],
    suppressions: [],
    outreachSettings: null,
  });
}

/** Upgrade a demo file written by an earlier version (v1 had simpler prospects). */
function migrate(raw: Record<string, unknown>): DemoDb {
  if (raw.version === 2) return raw as unknown as DemoDb;
  const legacy = { contacted: "invited", registered: "joined" } as Record<string, Prospect["status"]>;
  const prospects = ((raw.prospects as Record<string, unknown>[]) ?? []).map((p) => {
    const base = buildProspect(String(p.id), p as never, (p.importedBy as string) ?? null, String(p.createdAt));
    return { ...base, status: legacy[String(p.status)] ?? (p.status as Prospect["status"]) ?? "new" };
  });
  return { ...(raw as unknown as DemoDb), version: 2, prospects, outreach: [], suppressions: [], outreachSettings: null };
}

const now = () => new Date().toISOString();

/**
 * Demo-mode persistence: a single JSON file on the server (or memory in tests).
 * It performs no authorization of its own — every call goes through the
 * service layer, which is where demo-mode permissions are enforced.
 */
export class DemoStore implements DataStore {
  readonly kind = "demo" as const;
  private memory: DemoDb | null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private opts: { file?: string; initial?: DemoDb } = {}) {
    this.memory = opts.initial ?? (opts.file ? null : createSeedDb());
  }

  private async load(): Promise<DemoDb> {
    if (this.memory) return this.memory;
    const file = this.opts.file!;
    try {
      return migrate(JSON.parse(await readFile(file, "utf8")));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      const db = createSeedDb();
      await this.persist(db);
      return db;
    }
  }

  private async persist(db: DemoDb) {
    if (!this.opts.file) {
      this.memory = db;
      return;
    }
    await mkdir(path.dirname(this.opts.file), { recursive: true });
    const tmp = `${this.opts.file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(db, null, 2));
    await rename(tmp, this.opts.file);
  }

  private read<T>(fn: (db: DemoDb) => T): Promise<T> {
    return this.serial(async () => structuredClone(fn(await this.load())));
  }

  private write<T>(fn: (db: DemoDb) => T): Promise<T> {
    return this.serial(async () => {
      const db = await this.load();
      const out = fn(db);
      await this.persist(db);
      return structuredClone(out);
    });
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async reset() {
    await this.serial(() => this.persist(createSeedDb()));
  }

  private withCounts(db: DemoDb, p: ProviderProfile): ProviderProfile {
    const activeCount = db.requests.filter(
      (r) => r.providerId === p.userId && CAPACITY_STATUSES.includes(r.status),
    ).length;
    return { ...p, activeCount };
  }

  getAccount(id: string) {
    return this.read((db) => db.accounts.find((a) => a.id === id) ?? null);
  }
  listAccounts() {
    return this.read((db) => db.accounts);
  }
  updateAccount(id: string, patch: { fullName?: string; linkedinUrl?: string | null }) {
    return this.write((db) => {
      const a = db.accounts.find((x) => x.id === id);
      if (!a) throw new DomainError("not_found", "Account not found.");
      if (patch.fullName !== undefined) a.fullName = patch.fullName;
      if (patch.linkedinUrl !== undefined) a.linkedinUrl = patch.linkedinUrl;
    });
  }

  /** Demo-only sign-up. Role is always "member"; there is no parameter for it. */
  createAccount(input: { fullName: string; email: string }) {
    return this.write((db) => {
      const email = input.email.trim().toLowerCase();
      if (db.accounts.some((a) => a.email === email))
        throw new DomainError("conflict", "An account with this email already exists.");
      const account: Account = {
        id: randomUUID(),
        email,
        fullName: input.fullName,
        role: "member",
        communityId: "italian",
        linkedinUrl: null,
        isDemo: false,
        createdAt: now(),
      };
      db.accounts.push(account);
      return account;
    });
  }

  getStudentProfile(userId: string) {
    return this.read((db) => db.students.find((s) => s.userId === userId) ?? null);
  }
  listStudentProfiles() {
    return this.read((db) => db.students);
  }
  saveStudentProfile(userId: string, input: Parameters<DataStore["saveStudentProfile"]>[1]) {
    return this.write((db) => {
      const i = db.students.findIndex((s) => s.userId === userId);
      const prev = db.students[i];
      const next = {
        ...input,
        userId,
        isDemo: prev?.isDemo ?? false,
        createdAt: prev?.createdAt ?? now(),
        updatedAt: now(),
      };
      if (i >= 0) db.students[i] = next;
      else db.students.push(next);
      return next;
    });
  }

  getProviderProfile(userId: string) {
    return this.read((db) => {
      const p = db.providers.find((x) => x.userId === userId);
      return p ? this.withCounts(db, p) : null;
    });
  }
  listProviderProfiles() {
    return this.read((db) => db.providers.map((p) => this.withCounts(db, p)));
  }
  saveProviderProfile(userId: string, input: Parameters<DataStore["saveProviderProfile"]>[1]) {
    return this.write((db) => {
      const i = db.providers.findIndex((p) => p.userId === userId);
      const prev = db.providers[i];
      // Review fields are never taken from user input.
      const next: ProviderProfile = {
        ...input,
        userId,
        isPaused: prev?.isPaused ?? false,
        reviewStatus: prev?.reviewStatus === "approved" ? "approved" : "pending",
        reviewNote: prev?.reviewStatus === "approved" ? prev.reviewNote : null,
        activeCount: 0,
        isDemo: prev?.isDemo ?? false,
        createdAt: prev?.createdAt ?? now(),
        updatedAt: now(),
      };
      if (i >= 0) db.providers[i] = next;
      else db.providers.push(next);
      return this.withCounts(db, next);
    });
  }
  setProviderPaused(userId: string, paused: boolean) {
    return this.write((db) => {
      const p = db.providers.find((x) => x.userId === userId);
      if (!p) throw new DomainError("not_found", "Profile not found.");
      p.isPaused = paused;
      p.updatedAt = now();
    });
  }
  setProviderReview(userId: string, status: ProviderProfile["reviewStatus"], note: string | null) {
    return this.write((db) => {
      const p = db.providers.find((x) => x.userId === userId);
      if (!p) throw new DomainError("not_found", "Profile not found.");
      p.reviewStatus = status;
      p.reviewNote = note;
      p.updatedAt = now();
    });
  }

  getRequest(id: string) {
    return this.read((db) => db.requests.find((r) => r.id === id) ?? null);
  }
  listRequests(filter: { studentId?: string; providerId?: string } = {}) {
    return this.read((db) =>
      db.requests
        .filter(
          (r) =>
            (!filter.studentId || r.studentId === filter.studentId) &&
            (!filter.providerId || r.providerId === filter.providerId),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }
  createRequest(input: Parameters<DataStore["createRequest"]>[0]) {
    return this.write((db) => {
      const dup = db.requests.some(
        (r) =>
          r.studentId === input.studentId &&
          r.providerId === input.providerId &&
          r.service === input.service &&
          OPEN_STATUSES.includes(r.status),
      );
      if (dup) throw new DomainError("conflict", "You already have an open request with this person for this service.");
      const t = now();
      const req: IntroRequest = {
        id: randomUUID(),
        ...input,
        status: "pending",
        createdAt: t,
        updatedAt: t,
        respondedAt: null,
        introducedAt: null,
        closedAt: null,
      };
      db.requests.push(req);
      db.events.push({ id: randomUUID(), requestId: req.id, fromStatus: null, toStatus: "pending", actorId: input.studentId, note: null, createdAt: t });
      return req;
    });
  }
  transitionRequest(id: string, to: IntroRequest["status"], actorId: string, note: string | null = null) {
    return this.write((db) => {
      const r = db.requests.find((x) => x.id === id);
      if (!r) throw new DomainError("not_found", "Request not found.");
      const t = now();
      db.events.push({ id: randomUUID(), requestId: id, fromStatus: r.status, toStatus: to, actorId, note, createdAt: t });
      if (r.status === "pending" && (to === "accepted" || to === "declined")) r.respondedAt = t;
      if (to === "introduced") r.introducedAt = t;
      if (!OPEN_STATUSES.includes(to)) r.closedAt = t;
      r.status = to;
      r.updatedAt = t;
      return r;
    });
  }
  listRequestEvents(requestId: string) {
    return this.read((db) =>
      db.events.filter((e) => e.requestId === requestId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
  }

  listProspects() {
    return this.read((db) => [...db.prospects].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
  getProspect(id: string) {
    return this.read((db) => db.prospects.find((p) => p.id === id) ?? null);
  }
  importProspects(rows: Parameters<DataStore["importProspects"]>[0], importedBy: string) {
    return this.write((db) => {
      const emails = new Set(db.prospects.map((p) => p.email).filter(Boolean));
      const refs = new Set(db.prospects.filter((p) => p.sourceRef).map((p) => `${p.source}:${p.sourceRef}`));
      let inserted = 0;
      let duplicates = 0;
      for (const row of rows) {
        const email = row.email ? normalizeEmail(row.email) : null;
        const ref = row.sourceRef ? `${row.source ?? "csv"}:${row.sourceRef}` : null;
        if ((email && emails.has(email)) || (ref && refs.has(ref))) {
          duplicates++;
          continue;
        }
        if (email) emails.add(email);
        if (ref) refs.add(ref);
        db.prospects.push(buildProspect(randomUUID(), row, importedBy, now()));
        inserted++;
      }
      return { inserted, duplicates };
    });
  }
  updateProspect(id: string, patch: ProspectPatch) {
    return this.write((db) => {
      const p = db.prospects.find((x) => x.id === id);
      if (!p) throw new DomainError("not_found", "Candidate not found.");
      if (patch.email) {
        const email = normalizeEmail(patch.email);
        if (db.prospects.some((x) => x.id !== id && x.email === email))
          throw new DomainError("conflict", "Another candidate already has this email address.");
        patch = { ...patch, email };
      }
      Object.assign(p, patch, { updatedAt: now() });
      return p;
    });
  }

  getOutreachSettings() {
    return this.read((db) => db.outreachSettings);
  }
  saveOutreachSettings(settings: Omit<OutreachSettings, "updatedAt">) {
    return this.write((db) => {
      db.outreachSettings = { ...settings, updatedAt: now() };
    });
  }
  listOutreachMessages(filter: { prospectId?: string } = {}) {
    return this.read((db) =>
      db.outreach
        .filter((m) => !filter.prospectId || m.prospectId === filter.prospectId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }
  getOutreachMessage(id: string) {
    return this.read((db) => db.outreach.find((m) => m.id === id) ?? null);
  }
  createOutreachMessage(input: Parameters<DataStore["createOutreachMessage"]>[0]) {
    return this.write((db) => {
      const t = now();
      const m: OutreachMessage = {
        id: randomUUID(),
        ...input,
        status: "draft",
        approvedBy: null,
        approvedAt: null,
        approvedRecipient: null,
        approvedHash: null,
        provider: null,
        providerMessageId: null,
        attemptCount: 0,
        lastError: null,
        sentAt: null,
        createdAt: t,
        updatedAt: t,
      };
      db.outreach.push(m);
      return m;
    });
  }
  updateOutreachMessage(id: string, patch: Partial<OutreachMessage>, expect: OutreachStatus[]) {
    return this.write((db) => {
      const m = db.outreach.find((x) => x.id === id);
      if (!m || !expect.includes(m.status)) return null;
      // Mirrors the DB unique index: one sending/sent message per candidate.
      if (
        (patch.status === "sending" || patch.status === "sent") &&
        db.outreach.some((x) => x.id !== id && x.prospectId === m.prospectId && (x.status === "sending" || x.status === "sent"))
      )
        throw new DomainError("conflict", "This candidate already has an invitation being sent or sent.");
      Object.assign(m, patch, { updatedAt: now() });
      return m;
    });
  }

  listSuppressions() {
    return this.read((db) => [...db.suppressions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
  addSuppression(input: Parameters<DataStore["addSuppression"]>[0]) {
    return this.write((db) => {
      const email = normalizeEmail(input.email);
      if (db.suppressions.some((s) => s.email === email)) return;
      db.suppressions.push({ id: randomUUID(), ...input, email, createdAt: now() });
    });
  }
  removeSuppression(id: string) {
    return this.write((db) => {
      db.suppressions = db.suppressions.filter((s) => s.id !== id);
    });
  }
  isSuppressed(email: string) {
    return this.read((db) => db.suppressions.some((s) => s.email === normalizeEmail(email)));
  }
  unsubscribeByToken(token: string) {
    return this.write((db) => {
      const m = token ? db.outreach.find((x) => x.unsubscribeToken === token) : undefined;
      if (!m) return false;
      const email = m.recipient ? normalizeEmail(m.recipient) : null;
      if (email && !db.suppressions.some((s) => s.email === email))
        db.suppressions.push({ id: randomUUID(), email, reason: "unsubscribed", note: "Unsubscribe link", createdBy: null, createdAt: now() });
      const p = db.prospects.find((x) => x.id === m.prospectId);
      if (p) Object.assign(p, { doNotContact: true, updatedAt: now() });
      for (const x of db.outreach)
        if (x.prospectId === m.prospectId && (x.status === "draft" || x.status === "approved"))
          Object.assign(x, { status: "cancelled", lastError: "Recipient unsubscribed.", updatedAt: now() });
      return true;
    });
  }
  claimInvitation(token: string, userId: string) {
    return this.write((db) => {
      const m = token ? db.outreach.find((x) => x.inviteToken === token && (x.status === "sent" || x.status === "mock_logged")) : undefined;
      const p = m && db.prospects.find((x) => x.id === m.prospectId);
      if (!p || (p.joinedUserId && p.joinedUserId !== userId)) return false;
      Object.assign(p, { joinedUserId: userId, status: "joined", updatedAt: now() });
      return true;
    });
  }
  /** Webhook: provider reported a bounce/complaint after sending. */
  recordDeliveryFailure(providerMessageId: string, kind: "bounced" | "complaint", detail: string) {
    return this.write((db) => {
      const m = db.outreach.find((x) => x.providerMessageId === providerMessageId);
      if (!m) return false;
      Object.assign(m, { status: "bounced", lastError: `${kind}: ${detail}`.slice(0, 500), updatedAt: now() });
      if (m.recipient && !db.suppressions.some((s) => s.email === normalizeEmail(m.recipient!)))
        db.suppressions.push({ id: randomUUID(), email: normalizeEmail(m.recipient), reason: kind === "complaint" ? "complaint" : "bounced", note: detail.slice(0, 200), createdBy: null, createdAt: now() });
      return true;
    });
  }

  recordEmail(email: Omit<EmailRecord, "id" | "createdAt">) {
    return this.write((db) => {
      db.emails.unshift({ ...email, id: randomUUID(), createdAt: now() });
      db.emails = db.emails.slice(0, 200);
    });
  }
  listEmails() {
    return this.read((db) => db.emails);
  }
}
