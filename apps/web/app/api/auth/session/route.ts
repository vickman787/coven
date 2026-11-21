import { NextResponse } from "next/server";
import { getSessionAccountFromRequest } from "@/lib/auth";

/** GET /api/auth/session — who is signed in, if anyone. Never errors. */
export async function GET(request: Request) {
  const account = await getSessionAccountFromRequest(request);
  if (!account) return NextResponse.json({ signedIn: false });
  return NextResponse.json({
    address: account.address,
    displayName: account.displayName,
    signedIn: true,
  });
}
