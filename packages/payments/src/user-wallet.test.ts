import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { allocateBudget } from "@coven/shared";
import {
  balanceCoversBudget,
  buildHandoffSigningRequests,
  getUsdcBalanceCents,
  handoffPayloadFromSignature,
  isValidAddress,
  shortAddress,
} from "./user-wallet.js";
import type { PaymentPayload } from "./eip3009.js";
import {
  FacilitatorClient,
  PreSignedPaymentExecutor,
  recoverAuthorizationSigner,
  signPaymentAuthorization,
  validateUserAuthorizations,
} from "./x402.js";

/**
 * Signing in these tests stands in for the connected wallet: a
 * throwaway key is generated inside the test, used to sign the
 * exact typed-data requests the browser builds, and discarded.
 * No app code holds a user's private key — see user-wallet.ts.
 */
async function signHandoffsAsWallet(input: {
  budgetCents: number;
}): Promise<{ authorizations: PaymentPayload[]; payerAddress: string }> {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const requests = buildHandoffSigningRequests({
    budgetCents: input.budgetCents,
    payerAddress: account.address,
  });
  const authorizations: PaymentPayload[] = [];
  for (const request of requests) {
    const signature = await account.signTypedData({
      domain: request.domain,
      message: request.message,
      primaryType: request.primaryType,
      types: request.types,
    });
    authorizations.push(handoffPayloadFromSignature(request, signature));
  }
  return { authorizations, payerAddress: account.address };
}

describe("allocateBudget (shared, single source of truth)", () => {
  it("splits $5.00 as 200/200/50/50 and sums exactly", () => {
    expect(allocateBudget(500)).toEqual([
      { agent: "seeker", amountCents: 200 },
      { agent: "weaver", amountCents: 200 },
      { agent: "keeper", amountCents: 50 },
      { agent: "warden", amountCents: 50 },
    ]);
  });

  it("sums exactly for odd budgets", () => {
    for (const budget of [101, 333, 999, 1000]) {
      const sum = allocateBudget(budget).reduce((s, a) => s + a.amountCents, 0);
      expect(sum).toBe(budget);
    }
  });

  it("rejects non-positive budgets", () => {
    expect(() => allocateBudget(0)).toThrow();
  });
});

describe("address helpers", () => {
  it("shortens an address for display", () => {
    expect(shortAddress("0x38c80359CD99245f2Fae9C284579A10Af7a41932")).toBe(
      "0x38c8…1932",
    );
  });

  it("validates addresses and rejects a bad payer address when building requests", () => {
    expect(isValidAddress("0x38c80359CD99245f2Fae9C284579A10Af7a41932")).toBe(true);
    expect(isValidAddress("not-an-address")).toBe(false);
    expect(() =>
      buildHandoffSigningRequests({
        budgetCents: 500,
        payerAddress: "not-an-address",
      }),
    ).toThrow();
  });
});

describe("user handoff signing requests (WalletConnect flow)", () => {
  it("builds 4 requests, self-pay, distinct nonces, 10-minute window", () => {
    const payer = "0x38c80359CD99245f2Fae9C284579A10Af7a41932";
    const before = Math.floor(Date.now() / 1000);
    const requests = buildHandoffSigningRequests({ budgetCents: 500, payerAddress: payer });
    expect(requests).toHaveLength(4);
    expect(requests.map((r) => r.amountCents)).toEqual([200, 200, 50, 50]);
    const nonces = new Set(requests.map((r) => r.message.nonce));
    expect(nonces.size).toBe(4);
    for (const request of requests) {
      expect(request.message.from).toBe(payer);
      // Self-transfer: the user pays themselves, as in the demo model.
      expect(request.message.to).toBe(payer);
      expect(Number(request.message.validBefore - request.message.validAfter)).toBe(600);
      expect(Number(request.message.validAfter)).toBeGreaterThanOrEqual(before);
    }
  });

  it("signatures on the built requests recover to the user's address", async () => {
    const { authorizations, payerAddress } = await signHandoffsAsWallet({
      budgetCents: 500,
    });
    expect(authorizations).toHaveLength(4);
    const amounts = authorizations.map((p) =>
      Number(BigInt(p.payload.authorization.value) / 10_000n),
    );
    expect(amounts).toEqual([200, 200, 50, 50]);
    for (const payload of authorizations) {
      expect(payload.payload.authorization.from).toBe(payerAddress);
      expect(payload.payload.authorization.to).toBe(payerAddress);
      expect(await recoverAuthorizationSigner(payload)).toBe(payerAddress);
    }
  });

  it("server signing and wallet signing agree on the same domain", async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const serverPayload = await signPaymentAuthorization({
      amountCents: 200,
      payTo: account.address,
      privateKey,
    });
    const { authorizations } = await signHandoffsAsWallet({ budgetCents: 500 });
    // Note: signHandoffsAsWallet uses its own throwaway wallet, so
    // compare domains via the server payload against a set signed
    // by the same account instead.
    const requests = buildHandoffSigningRequests({
      budgetCents: 500,
      payerAddress: account.address,
    });
    const signature = await account.signTypedData({
      domain: requests[0]!.domain,
      message: requests[0]!.message,
      primaryType: requests[0]!.primaryType,
      types: requests[0]!.types,
    });
    const walletPayload = handoffPayloadFromSignature(requests[0]!, signature);
    expect(await recoverAuthorizationSigner(serverPayload)).toBe(account.address);
    expect(await recoverAuthorizationSigner(walletPayload)).toBe(account.address);
    // Same domain/types: the accepted requirements match except amount.
    expect(walletPayload.accepted.asset).toBe(serverPayload.accepted.asset);
    expect(walletPayload.accepted.network).toBe(serverPayload.accepted.network);
    expect(authorizations).toHaveLength(4);
  });
});

describe("validateUserAuthorizations (server)", () => {
  async function validSet(budgetCents = 500) {
    const { authorizations, payerAddress } = await signHandoffsAsWallet({
      budgetCents,
    });
    return { authorizations, payerAddress };
  }

  it("accepts a correct set", async () => {
    const { authorizations, payerAddress } = await validSet();
    const result = await validateUserAuthorizations({
      authorizations,
      budgetCents: 500,
      payTo: payerAddress,
      payerAddress,
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects a set for the wrong budget", async () => {
    const { authorizations, payerAddress } = await validSet(500);
    const result = await validateUserAuthorizations({
      authorizations,
      budgetCents: 300,
      payTo: payerAddress,
      payerAddress,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a set claimed for a different wallet", async () => {
    const { authorizations, payerAddress } = await validSet();
    const other = privateKeyToAccount(generatePrivateKey()).address;
    const result = await validateUserAuthorizations({
      authorizations,
      budgetCents: 500,
      payTo: payerAddress,
      payerAddress: other,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a tampered amount", async () => {
    const { authorizations, payerAddress } = await validSet();
    const tampered = authorizations.map((p, i) =>
      i === 0
        ? {
            ...p,
            payload: {
              ...p.payload,
              authorization: { ...p.payload.authorization, value: "9999999" },
            },
          }
        : p,
    );
    const result = await validateUserAuthorizations({
      authorizations: tampered,
      budgetCents: 500,
      payTo: payerAddress,
      payerAddress,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects too few authorizations", async () => {
    const { authorizations, payerAddress } = await validSet();
    const result = await validateUserAuthorizations({
      authorizations: authorizations.slice(0, 2),
      budgetCents: 500,
      payTo: payerAddress,
      payerAddress,
    });
    expect(result.ok).toBe(false);
  });
});

describe("PreSignedPaymentExecutor", () => {
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

  it("settles handoffs in order from the user's signed payloads", async () => {
    const { authorizations } = await signHandoffsAsWallet({ budgetCents: 500 });
    const executor = new PreSignedPaymentExecutor({
      facilitator: fakeFacilitator({
        settle: { success: true, transaction: "0xuser1" },
        verify: { isValid: true },
      }),
      payloads: authorizations,
    });
    const first = await executor.pay({ amountCents: 200, description: "seeker" });
    expect(first.status).toBe("settled");
    expect(first.txHash).toBe("0xuser1");
    const second = await executor.pay({ amountCents: 200, description: "weaver" });
    expect(second.status).toBe("settled");
  });

  it("is unresolved when the facilitator rejects for insufficient balance", async () => {
    const { authorizations } = await signHandoffsAsWallet({ budgetCents: 500 });
    const executor = new PreSignedPaymentExecutor({
      facilitator: fakeFacilitator({
        settle: { success: false },
        verify: { invalidReason: "invalid_exact_evm_insufficient_balance", isValid: false },
      }),
      payloads: authorizations,
    });
    const result = await executor.pay({ amountCents: 200, description: "seeker" });
    expect(result.status).toBe("unresolved");
    expect(result.reason).toBe("invalid_exact_evm_insufficient_balance");
  });

  it("is unresolved, never settled, when the payloads run out", async () => {
    const executor = new PreSignedPaymentExecutor({
      facilitator: fakeFacilitator({
        settle: { success: true, transaction: "0xabc" },
        verify: { isValid: true },
      }),
      payloads: [],
    });
    const result = await executor.pay({ amountCents: 200, description: "seeker" });
    expect(result.status).toBe("unresolved");
    expect(result.reason).toMatch(/no signed authorization/);
  });

  it("is unresolved when a payload amount does not match the handoff", async () => {
    const { authorizations } = await signHandoffsAsWallet({ budgetCents: 500 });
    const executor = new PreSignedPaymentExecutor({
      facilitator: fakeFacilitator({
        settle: { success: true, transaction: "0xabc" },
        verify: { isValid: true },
      }),
      payloads: authorizations,
    });
    const result = await executor.pay({ amountCents: 999, description: "wrong" });
    expect(result.status).toBe("unresolved");
  });
});

describe("USDC balance check", () => {
  it("reads balanceOf via eth_call and converts to cents", async () => {
    const balance = await getUsdcBalanceCents(
      "0x38c80359CD99245f2Fae9C284579A10Af7a41932",
      (async () => {
        // 20 USDC = 20,000,000 atomic units.
        return new Response(JSON.stringify({ result: "0x1312d00" }), {
          headers: { "content-type": "application/json" },
        });
      }) as unknown as typeof fetch,
    );
    expect(balance).toBe(2000);
  });

  it("returns null when the RPC is down, never a fake zero", async () => {
    const balance = await getUsdcBalanceCents(
      "0x38c80359CD99245f2Fae9C284579A10Af7a41932",
      (async () => {
        throw new Error("rpc down");
      }) as unknown as typeof fetch,
    );
    expect(balance).toBeNull();
  });

  it("retries once after a transient RPC failure", async () => {
    let calls = 0;
    const balance = await getUsdcBalanceCents(
      "0x38c80359CD99245f2Fae9C284579A10Af7a41932",
      (async () => {
        calls += 1;
        if (calls === 1) throw new Error("transient");
        return new Response(JSON.stringify({ result: "0x1312d00" }), {
          headers: { "content-type": "application/json" },
        });
      }) as unknown as typeof fetch,
    );
    expect(balance).toBe(2000);
    expect(calls).toBe(2);
  });

  it("a known balance below the budget does not cover it; unknown does not block", () => {
    expect(balanceCoversBudget(100, 500)).toBe(false);
    expect(balanceCoversBudget(500, 500)).toBe(true);
    expect(balanceCoversBudget(null, 500)).toBe(true);
  });
});
