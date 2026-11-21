import { NextResponse } from "next/server";
import { getLedger } from "@/lib/coven";
import { getSessionAccountFromRequest } from "@/lib/auth";

/**
 * GET /api/wallet — the signed-in account's payment history from
 * the ledger: every payment from jobs that wallet paid for, newest
 * first, with status and x402 hash when settled. The onchain test
 * USDC balance itself is read client-side from the public RPC.
 */
export async function GET(request: Request) {
  const account = await getSessionAccountFromRequest(request);
  if (!account) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }
  const ledger = await getLedger();
  const payments = await ledger.listAccountPayments(account.address, 50);
  return NextResponse.json({
    address: account.address,
    displayName: account.displayName,
    payments,
  });
}
