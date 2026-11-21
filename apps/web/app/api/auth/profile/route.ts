import { NextResponse } from "next/server";
import { z } from "zod";
import { getLedger } from "@/lib/coven";
import { getSessionAccountFromRequest } from "@/lib/auth";

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
});

/** PATCH /api/auth/profile — set the signed-in account's display name. */
export async function PATCH(request: Request) {
  const account = await getSessionAccountFromRequest(request);
  if (!account) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "display name must be 1–40 characters" },
      { status: 400 },
    );
  }
  const ledger = await getLedger();
  const updated = await ledger.setDisplayName(account.address, parsed.data.displayName);
  return NextResponse.json({
    address: updated.address,
    displayName: updated.displayName,
  });
}
