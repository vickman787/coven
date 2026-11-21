import { NextResponse } from "next/server";
import { z } from "zod";
import { getLedger } from "@/lib/coven";
import { isValidAddress, setSessionCookie, verifyLoginSignature } from "@/lib/auth";

const verifySchema = z.object({
  address: z.string(),
  message: z.string().min(1).max(2000),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

/**
 * POST /api/auth/verify — finish sign-in. The client sends the
 * address, the exact message it signed, and the signature. The
 * server checks the nonce inside the message is the live
 * single-use nonce for that address, recovers the signer, and
 * issues a 30-day session cookie when it matches. First sign-in
 * creates the account; later sign-ins reuse it.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success || !isValidAddress(parsed.data.address)) {
    return NextResponse.json({ error: "address, message, and signature are required" }, { status: 400 });
  }
  const address = parsed.data.address.toLowerCase();
  const verified = await verifyLoginSignature({
    address,
    message: parsed.data.message,
    signature: parsed.data.signature,
  });
  if (!verified) {
    return NextResponse.json(
      { error: "signature does not match this wallet — sign the login message again" },
      { status: 401 },
    );
  }
  const ledger = await getLedger();
  const account = await ledger.createAccount(address);
  const session = await ledger.createSession(address);
  const response = NextResponse.json({
    address: account.address,
    displayName: account.displayName,
    signedIn: true,
  });
  setSessionCookie(response, session.token);
  return response;
}
