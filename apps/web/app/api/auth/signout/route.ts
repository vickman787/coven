import { NextResponse } from "next/server";
import { getLedger } from "@/lib/coven";
import { clearSessionCookie } from "@/lib/auth";

/** POST /api/auth/signout — delete the session and clear the cookie. */
export async function POST(request: Request) {
  const header = request.headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)coven_session=([^;]+)/.exec(header);
  const response = NextResponse.json({ signedIn: false });
  if (match?.[1]) {
    const ledger = await getLedger();
    await ledger.deleteSession(decodeURIComponent(match[1]));
  }
  clearSessionCookie(response);
  return response;
}
