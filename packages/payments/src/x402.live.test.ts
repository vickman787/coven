import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  buildPaymentRequirements,
  FacilitatorClient,
  signPaymentAuthorization,
} from "./x402.js";
import type { Hex } from "viem";

// Live tests against the real x402 facilitator. Run with:
//   COVEN_LIVE_X402=1 pnpm --filter @coven/payments test
// They need network access and a few seconds. They never move money:
// the wallet is freshly generated and unfunded, so /verify is expected
// to fail on balance — which itself proves the signature was accepted
// far enough for the facilitator to check the balance.
// NOTE (2026-11-19): /verify hung with no response for 90s+ from this VM
// on the first live attempt, while /supported answered in under 1s.
// A later end-to-end crew run got a real answer from /verify:
// invalid_exact_evm_insufficient_balance — the signature was accepted
// and the check failed on balance, exactly as the spec predicts for an
// unfunded wallet. The test timeout is 120s; slowness here is the
// facilitator's onchain simulation, not necessarily a bad payload.
const LIVE = process.env.COVEN_LIVE_X402 === "1";

describe.skipIf(!LIVE)("x402 facilitator (live)", () => {
  it("supports exact on Base Sepolia", async () => {
    const client = new FacilitatorClient();
    const supported = (await client.supported()) as {
      kinds: { network: string; scheme: string }[];
    };
    expect(
      supported.kinds.some(
        (k) => k.network === "eip155:84532" && k.scheme === "exact",
      ),
    ).toBe(true);
  }, 30_000);

  it("verifies a real signed EIP-3009 authorization", async () => {
    const privateKey = generatePrivateKey() as Hex;
    const account = privateKeyToAccount(privateKey);
    const payTo = account.address; // pay to self; balance is 0 either way
    const requirements = buildPaymentRequirements({
      amountCents: 1,
      payTo,
    });
    const payload = await signPaymentAuthorization({
      amountCents: 1,
      payTo,
      privateKey,
    });
    const client = new FacilitatorClient();
    const result = await client.verify(payload, requirements);
    // The response must be well-formed. An unfunded wallet is expected
    // to fail verification on balance, not on signature.
    expect(typeof result.isValid).toBe("boolean");
    console.log(
      `live /verify: isValid=${result.isValid} invalidReason=${result.invalidReason ?? "none"} payer=${result.payer ?? "none"}`,
    );
    if (!result.isValid) {
      expect(result.invalidReason).toBeDefined();
      expect(result.invalidReason).toMatch(/balance|insufficient/i);
    }
  }, 120_000);
});
