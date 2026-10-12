import type { Env } from "../config";

/**
 * Outreach email adapters.
 *
 * - ResendSender: real delivery through Resend's HTTP API. Uses the outreach
 *   message id as `Idempotency-Key`, so a retried request within 24 hours is
 *   not delivered twice (the database send-claim is the primary guard).
 * - MockSender: for local development. It NEVER reports a successful send;
 *   every message ends as "mock_logged" (not delivered).
 */

export interface OutgoingInvitation {
  idempotencyKey: string;
  to: string;
  subject: string;
  body: string;
  unsubscribeUrl: string;
}

export type SendOutcome =
  | { outcome: "sent"; providerMessageId: string }
  | { outcome: "failed"; error: string }
  | { outcome: "mock_logged"; note: string };

export interface OutreachSender {
  readonly kind: "resend" | "mock";
  send(msg: OutgoingInvitation): Promise<SendOutcome>;
}

export class ResendSender implements OutreachSender {
  readonly kind = "resend" as const;
  constructor(
    private apiKey: string,
    private from: string,
    private replyTo: string | undefined,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async send(msg: OutgoingInvitation): Promise<SendOutcome> {
    let res: Response;
    try {
      res = await this.fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": msg.idempotencyKey,
        },
        body: JSON.stringify({
          from: this.from,
          to: [msg.to],
          subject: msg.subject,
          text: msg.body,
          reply_to: this.replyTo,
          headers: {
            "List-Unsubscribe": `<${msg.unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
          tags: [{ name: "category", value: "mentor_recruitment" }],
        }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      return { outcome: "failed", error: "Couldn't reach the email provider (network error or timeout)." };
    }
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (res.ok && body.id) return { outcome: "sent", providerMessageId: body.id };
    return {
      outcome: "failed",
      error: `Email provider rejected the message (${res.status}${body.name ? ` ${body.name}` : ""}): ${body.message ?? "no details"}`.slice(0, 500),
    };
  }
}

export class MockSender implements OutreachSender {
  readonly kind = "mock" as const;
  async send(): Promise<SendOutcome> {
    return { outcome: "mock_logged", note: "Mock email adapter: recorded locally, NOT delivered to anyone." };
  }
}

export interface SendingStatus {
  /** True only when a real account is configured AND an admin turned sending on. */
  live: boolean;
  sender: OutreachSender;
  /** Why real sending is off (empty when live). */
  reasons: string[];
  siteUrl: string;
  maxBatch: number;
}

export function sendingStatus(env: Env, demo: boolean, adminEnabled: boolean, fetchImpl: typeof fetch = fetch): SendingStatus {
  const reasons: string[] = [];
  const siteUrl = env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const maxBatch = Math.max(1, Math.min(50, Number(env.OUTREACH_MAX_BATCH) || 25));
  if (demo) reasons.push("Demo mode never sends email.");
  if (!env.RESEND_API_KEY) reasons.push("RESEND_API_KEY is not set.");
  if (!env.OUTREACH_FROM_EMAIL) reasons.push("OUTREACH_FROM_EMAIL is not set (a sender on a domain verified in Resend).");
  if (!env.NEXT_PUBLIC_SITE_URL) reasons.push("NEXT_PUBLIC_SITE_URL is not set, so signup and unsubscribe links can't be built.");
  const configured = reasons.length === 0;
  if (configured && !adminEnabled) reasons.push("Sending is switched off in Recruitment → Settings.");
  const live = configured && adminEnabled;
  return {
    live,
    sender: live ? new ResendSender(env.RESEND_API_KEY!, env.OUTREACH_FROM_EMAIL!, env.OUTREACH_REPLY_TO, fetchImpl) : new MockSender(),
    reasons,
    siteUrl,
    maxBatch,
  };
}
