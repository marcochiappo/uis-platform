"use server";

import type { ActionState } from "@/lib/action-state";
import { getPublicStore } from "@/lib/server";
import { unsubscribe } from "@/lib/services";

export async function unsubscribeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const token = String(fd.get("token") ?? "");
  try {
    const done = await unsubscribe(await getPublicStore(), token);
    if (!done) return { status: "error", message: "This unsubscribe link isn't valid. If you keep receiving emails, reply to one and ask us to stop." };
    return { status: "success", message: "Done. UIS won't email you about mentoring again." };
  } catch (e) {
    console.error(e);
    return { status: "error", message: "Something went wrong. Please try again, or reply to our email and we'll remove you by hand." };
  }
}
