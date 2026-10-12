import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies a Resend webhook (Resend signs webhooks with Svix):
 * signature = base64(HMAC-SHA256(secret, `${svix-id}.${svix-timestamp}.${body}`)),
 * sent as space-separated "v1,<sig>" entries in the `svix-signature` header.
 * The secret is the `whsec_…` value from the Resend dashboard.
 */
export function verifyWebhook(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${body}`).digest();
  return headers.signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export type DeliveryEvent = { kind: "bounced" | "complaint"; providerMessageId: string; detail: string } | null;

/** Map a Resend event to a delivery failure. Opens, clicks and replies are never recorded. */
export function toDeliveryEvent(payload: unknown): DeliveryEvent {
  const p = payload as { type?: string; data?: { email_id?: string; bounce?: { message?: string; type?: string } } };
  const id = p?.data?.email_id;
  if (!id) return null;
  if (p.type === "email.bounced") return { kind: "bounced", providerMessageId: id, detail: p.data?.bounce?.message ?? p.data?.bounce?.type ?? "Bounced" };
  if (p.type === "email.complained") return { kind: "complaint", providerMessageId: id, detail: "Recipient marked the message as spam" };
  return null;
}
