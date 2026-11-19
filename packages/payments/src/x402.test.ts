import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  atomicUnitsToCents,
  buildPaymentRequired,
  buildPaymentRequirements,
  centsToAtomicUnits,
  decodePaymentRequired,
  encodePaymentRequired,
  FacilitatorClient,
  NETWORK,
  recoverAuthorizationSigner,
  signPaymentAuthorization,
  USDC_BASE_SEPOLIA,
  X402PaymentExecutor,
} from "./x402.js";
import type { Hex } from "viem";

const PAYEE = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";

describe("money conversion", () => {
  it("converts cents to USDC atomic units: $5.00 = 5,000,000 units", () => {
    expect(centsToAtomicUnits(500)).toBe(5_000_000n);
    expect(centsToAtomicUnits(1)).toBe(10_000n);
    expect(centsToAtomicUnits(200)).toBe(2_000_000n);
  });

  it("round-trips cents to atomic units and back", () => {
    for (const cents of [1, 50, 200, 500]) {
      expect(atomicUnitsToCents(centsToAtomicUnits(cents))).toBe(cents);
    }
  });

  it("rejects non-integer and non-positive amounts", () => {
    expect(() => centsToAtomicUnits(0)).toThrow();
    expect(() => centsToAtomicUnits(-5)).toThrow();
    expect(() => centsToAtomicUnits(1.5)).toThrow();
  });
});

describe("payment requirements", () => {
  it("builds exact-scheme requirements for Base Sepolia USDC", () => {
    const req = buildPaymentRequirements({ amountCents: 200, payTo: PAYEE });
    expect(req).toEqual({
      amount: "2000000",
      asset: USDC_BASE_SEPOLIA,
      extra: { assetTransferMethod: "eip3009", name: "USDC", version: "2" },
      maxTimeoutSeconds: 60,
      network: NETWORK,
      payTo: PAYEE,
      scheme: "exact",
    });
  });

  it("encodes and decodes a 402 PAYMENT-REQUIRED header", () => {
    const required = buildPaymentRequired({
      amountCents: 200,
      description: "Seeker research step",
      payTo: PAYEE,
      url: "https://coven.example/jobs/job-1/steps/seek",
    });
    const header = encodePaymentRequired(required);
    const decoded = decodePaymentRequired(header);
    expect(decoded.x402Version).toBe(2);
    expect(decoded.accepts[0]?.amount).toBe("2000000");
    expect(decoded.accepts[0]?.asset).toBe(USDC_BASE_SEPOLIA);
    expect(decoded.resource.url).toContain("job-1");
  });
});

describe("EIP-3009 signing", () => {
  it("signs an authorization that recovers to the payer", async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const payload = await signPaymentAuthorization({
      amountCents: 200,
      payTo: PAYEE,
      privateKey,
    });
    expect(payload.x402Version).toBe(2);
    expect(payload.accepted.amount).toBe("2000000");
    expect(payload.payload.authorization.from).toBe(account.address);
    expect(payload.payload.authorization.to).toBe(PAYEE);
    expect(payload.payload.authorization.value).toBe("2000000");
    expect(payload.payload.signature).toMatch(/^0x[0-9a-f]{130}$/);
    const signer = await recoverAuthorizationSigner(payload);
    expect(signer).toBe(account.address);
  });

  it("a tampered amount does not recover to the payer", async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const payload = await signPaymentAuthorization({
      amountCents: 200,
      payTo: PAYEE,
      privateKey,
    });
    const tampered = {
      ...payload,
      payload: {
        ...payload.payload,
        authorization: { ...payload.payload.authorization, value: "9999999" },
      },
    };
    const signer = await recoverAuthorizationSigner(tampered);
    expect(signer).not.toBe(account.address);
  });
});

describe("payment executor with a fake facilitator", () => {
  function fakeFacilitator(opts: {
    settle: { errorReason?: string; success: boolean; transaction?: string };
    verify: { invalidReason?: string; isValid: boolean };
  }) {
    return new FacilitatorClient(
      "https://facilitator.example",
      (async (url: string) => {
        const body = url.endsWith("/verify") ? opts.verify : opts.settle;
        return new Response(JSON.stringify(body), {
          headers: { "content-type": "application/json" },
        });
      }) as unknown as typeof fetch,
    );
  }

  it("settles when the facilitator verifies and settles", async () => {
    const executor = new X402PaymentExecutor({
      facilitator: fakeFacilitator({
        settle: { success: true, transaction: "0xabc123" },
        verify: { isValid: true },
      }),
      payTo: PAYEE,
      payerPrivateKey: generatePrivateKey() as Hex,
    });
    const result = await executor.pay({
      amountCents: 200,
      description: "test payment",
    });
    expect(result.status).toBe("settled");
    expect(result.txHash).toBe("0xabc123");
  });

  it("is unresolved, not settled, when verification fails", async () => {
    const executor = new X402PaymentExecutor({
      facilitator: fakeFacilitator({
        settle: { success: false },
        verify: { invalidReason: "bad_signature", isValid: false },
      }),
      payTo: PAYEE,
      payerPrivateKey: generatePrivateKey() as Hex,
    });
    const result = await executor.pay({
      amountCents: 200,
      description: "test payment",
    });
    expect(result.status).toBe("unresolved");
    expect(result.txHash).toBeUndefined();
    expect(result.reason).toBe("bad_signature");
  });

  it("is unresolved, not settled, when settlement fails", async () => {
    const executor = new X402PaymentExecutor({
      facilitator: fakeFacilitator({
        settle: { errorReason: "settle_failed", success: false },
        verify: { isValid: true },
      }),
      payTo: PAYEE,
      payerPrivateKey: generatePrivateKey() as Hex,
    });
    const result = await executor.pay({
      amountCents: 200,
      description: "test payment",
    });
    expect(result.status).toBe("unresolved");
    expect(result.reason).toBe("settle_failed");
  });
});
