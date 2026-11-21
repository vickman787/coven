import { NextResponse } from "next/server";
import { z } from "zod";
import { getLedger } from "@/lib/coven";
import { buildLoginMessage, isValidAddress } from "@/lib/auth";

const nonceSchema = z.object({ address: z.string() });

/**
 * POST /api/auth/nonce — start sign-in. The client sends its
 * wallet address and gets back a single-use nonce and the exact
 * message to sign with the extension. The nonce lives 10 minutes.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = nonceSchema.safeParse(body);
  if (!parsed.success || !isValidAddress(parsed.data.address)) {
    return NextResponse.json({ error: "address must be a wallet address" }, { status: 400 });
  }
  const address = parsed.data.address.toLowerCase();
  const ledger = await getLedger();
  const { nonce } = await ledger.createLoginNonce(address);
  return NextResponse.json({
    message: buildLoginMessage({ address, nonce }),
    nonce,
  });
}
