import { connection, NextResponse, type NextRequest } from "next/server";
import { getPublicStore } from "@/lib/server";
import { unsubscribe } from "@/lib/services";

/** RFC 8058 one-click unsubscribe (mail clients POST here from the List-Unsubscribe header). */
export async function POST(request: NextRequest) {
  await connection();
  const token = request.nextUrl.searchParams.get("t") ?? "";
  await unsubscribe(await getPublicStore(), token);
  // Same response whether or not the token matched, so tokens can't be probed.
  return new NextResponse(null, { status: 204 });
}

/** A plain GET (e.g. a link scanner) never unsubscribes; send people to the confirmation page. */
export async function GET(request: NextRequest) {
  await connection();
  const token = request.nextUrl.searchParams.get("t") ?? "";
  return NextResponse.redirect(new URL(`/unsubscribe?t=${encodeURIComponent(token)}`, request.url));
}
