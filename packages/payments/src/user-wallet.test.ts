import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { allocateBudget } from "@coven/shared";
import {
  balanceCoversBudget,
  generateUserWallet,
  getUsdcBalanceCents,
  isValidAddress,
  shortAddress,
  signUserHandoffAuthorizations,
  addressFromPrivateKey,
} from "./user-wallet.js";
import {
  FacilitatorClient,
  PreSignedPaymentExecutor,
  recoverAuthorizationSigner,
  signPaymentAuthorization,
  validateUserAuthorizations,
} from "./x402.js";

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

describe("user wallet generation", () => {
  it("generates a wallet whose address derives from its key", () => {
    const wallet = generateUserWallet();
    expect(isValidAddress(wallet.address)).toBe(true);
    expect(addressFromPrivateKey(wallet.privateKey)).toBe(wallet.address);
    expect(privateKeyToAccount(wallet.privateKey).address).toBe(wallet.address);
  });

  it("rejects a malformed private key on import", () => {
    expect(() => addressFromPrivateKey("not-a-key")).toThrow();
    expect(() => addressFromPrivateKey("0x1234")).toThrow();
  });

  it("shortens an address for display", () => {
    expect(shortAddress("0x38c80359CD99245f2Fae9C284579A10Af7a41932")).toBe(
      "0x38c8…1932",
    );
  });
});

describe("user handoff authorizations (browser signing)", () => {
  it("signs 4 authorizations, self-pay, that recover to the user's address", async () => {
    const wallet = generateUserWallet();
    const { authorizations, payerAddress } = await signUserHandoffAuthorizations({
      budgetCents: 500,
      privateKey: wallet.privateKey,
    });
    expect(payerAddress).toBe(wallet.address);
    expect(authorizations).toHaveLength(4);
    const amounts = authorizations.map((p) =>
      Number(BigInt(p.payload.authorization.value) / 10_000n),
    );
    expect(amounts).toEqual([200, 200, 50, 50]);
    const nonces = new Set(authorizations.map((p) => p.payload.authorization.nonce));
    expect(nonces.size).toBe(4);
    for (const payload of authorizations) {
      expect(payload.payload.authorization.from).toBe(wallet.address);
      // Self-transfer: the user pays themselves, as in the demo model.
      expect(payload.payload.authorization.to).toBe(wallet.address);
      expect(await recoverAuthorizationSigner(payload)).toBe(wallet.address);
    }
  });

  it("server signing and browser signing agree on the same domain", async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const serverPayload = await signPaymentAuthorization({
      amountCents: 200,
      payTo: account.address,
      privateKey,
    });
    const browser = await signUserHandoffAuthorizations({
      budgetCents: 500,
      privateKey,
    });
    expect(await recoverAuthorizationSigner(serverPayload)).toBe(account.address);
    expect(await recoverAuthorizationSigner(browser.authorizations[0]!)).toBe(
      account.address,
    );
    // Same domain/types: the accepted requirements match except amount.
    expect(browser.authorizations[0]!.accepted.asset).toBe(serverPayload.accepted.asset);
    expect(browser.authorizations[0]!.accepted.network).toBe(
      serverPayload.accepted.network,
    );
  });
});

describe("validateUserAuthorizations (server)", () => {
  async function validSet(budgetCents = 500) {
    const wallet = generateUserWallet();
    const { authorizations, payerAddress } = await signUserHandoffAuthorizations({
      budgetCents,
      privateKey: wallet.privateKey,
    });
    return { authorizations, payerAddress, wallet };
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
    const other = generateUserWallet();
    const result = await validateUserAuthorizations({
      authorizations,
      budgetCents: 500,
      payTo: payerAddress,
      payerAddress: other.address,
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
    const wallet = generateUserWallet();
    const { authorizations } = await signUserHandoffAuthorizations({
      budgetCents: 500,
      privateKey: wallet.privateKey,
    });
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
    const wallet = generateUserWallet();
    const { authorizations } = await signUserHandoffAuthorizations({
      budgetCents: 500,
      privateKey: wallet.privateKey,
    });
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
    const wallet = generateUserWallet();
    const { authorizations } = await signUserHandoffAuthorizations({
      budgetCents: 500,
      privateKey: wallet.privateKey,
    });
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
