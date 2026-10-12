import { createClient } from "@supabase/supabase-js";
import { connection, NextResponse, type NextRequest } from "next/server";
import { isDemoMode } from "@/lib/config";
import { SupabaseStore } from "@/lib/data/supabase-store";
import type { DataStore } from "@/lib/data/store";
import { toDeliveryEvent, verifyWebhook } from "@/lib/recruitment/webhook";
import { getDemoStore } from "@/lib/server";

/**
 * Resend delivery webhook. Records bounces/complaints as delivery failures and
 * adds the address to the do-not-contact list. Requires RESEND_WEBHOOK_SECRET;
 * in Supabase mode also SUPABASE_SECRET_KEY (server-only) because there is no
 * user session. Other events (delivered, opened…) are acknowledged and ignored.
 */
export async function POST(request: NextRequest) {
  await connection();
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  const body = await request.text();
  const valid = verifyWebhook(
    secret,
    { id: request.headers.get("svix-id"), timestamp: request.headers.get("svix-timestamp"), signature: request.headers.get("svix-signature") },
    body,
  );
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let event;
  try {
    event = toDeliveryEvent(JSON.parse(body));
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!event) return NextResponse.json({ ok: true, ignored: true });

  let store: DataStore;
  if (isDemoMode()) store = getDemoStore();
  else {
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!key) return NextResponse.json({ error: "SUPABASE_SECRET_KEY not configured" }, { status: 503 });
    store = new SupabaseStore(createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } }));
  }
  const recorded = await store.recordDeliveryFailure(event.providerMessageId, event.kind, event.detail);
  return NextResponse.json({ ok: true, recorded });
}
