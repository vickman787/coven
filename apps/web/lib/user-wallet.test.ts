import { describe, expect, it } from "vitest";
import { generateUserWallet } from "@coven/payments/user-wallet";
import {
  buildUserJobRequest,
  createUserWallet,
  importUserWallet,
  loadUserWallet,
  removeUserWallet,
} from "./user-wallet.js";

/**
 * The private key must never leave the browser. This test builds the
 * exact POST body the Summon flow sends and asserts the key is not
 * in it — only the address and the signed authorizations.
 */
describe("buildUserJobRequest", () => {
  it("sends only the address and signed authorizations, never the private key", async () => {
    const wallet = generateUserWallet();
    const request = await buildUserJobRequest({
      budgetCents: 500,
      job: "research 10 competitors and write a one-page brief",
      wallet: { address: wallet.address, privateKey: wallet.privateKey },
    });
    expect(request.paymentMode).toBe("user");
    expect(request.payerAddress).toBe(wallet.address);
    expect(request.authorizations).toHaveLength(4);
    const body = JSON.stringify(request);
    expect(body).not.toContain(wallet.privateKey);
    expect(body).not.toContain(wallet.privateKey.slice(2));
    expect(body).toContain(wallet.address);
  });
});

describe("browser wallet storage", () => {
  it("round-trips create/load/import/remove through localStorage", () => {
    const store = new Map<string, string>();
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        removeItem: (k: string) => {
          store.delete(k);
        },
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
      },
    };
    expect(loadUserWallet()).toBeNull();
    const created = createUserWallet();
    expect(loadUserWallet()?.address).toBe(created.address);
    const imported = importUserWallet(created.privateKey);
    expect(imported.address).toBe(created.address);
    removeUserWallet();
    expect(loadUserWallet()).toBeNull();
    expect(() => importUserWallet("not-a-key")).toThrow();
    delete (globalThis as unknown as { window?: unknown }).window;
  });
});
