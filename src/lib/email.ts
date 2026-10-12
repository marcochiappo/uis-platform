import type { DataStore } from "./data/store";
import type { EmailRecord } from "./domain/types";

export interface OutgoingEmail {
  to: string[];
  subject: string;
  body: string;
}

export type Delivery = EmailRecord["delivery"];
export type Mailer = (email: OutgoingEmail) => Promise<Delivery>;

interface MailerOptions {
  demo: boolean;
  store: DataStore;
  apiKey?: string;
  from?: string;
  fetchImpl?: typeof fetch;
}

/**
 * In demo mode, email is never sent: the message is written to the local
 * outbox (visible to UIS admins) and marked "suppressed_demo". Outside demo
 * mode it uses Resend's HTTP API only when RESEND_API_KEY and EMAIL_FROM are
 * both set; otherwise it reports "not_configured".
 */
export function createMailer({ demo, store, apiKey, from, fetchImpl = fetch }: MailerOptions): Mailer {
  return async (email) => {
    if (demo) {
      await store.recordEmail({ ...email, delivery: "suppressed_demo" });
      return "suppressed_demo";
    }
    if (!apiKey || !from) {
      console.info(`[email] not configured; skipped "${email.subject}"`);
      return "not_configured";
    }
    try {
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: email.to, subject: email.subject, text: email.body }),
      });
      return res.ok ? "sent" : "failed";
    } catch {
      return "failed";
    }
  };
}
