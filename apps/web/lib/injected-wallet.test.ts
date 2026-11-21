import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Hex } from "viem";
import { getAccount, signTypedData } from "wagmi/actions";
import {
  HANDOFF_SIGNATURE_COUNT,
  HandoffSigningError,
  NO_WALLET_CONNECTED_MESSAGE,
  buildUserJobRequest,
  getConnectedAddress,
  signHandoffAuthorizations,
} from "./injected-wallet.js";
import type { PaymentPayload } from "@coven/payments";
import { getWagmiConfig, hasInjectedWallet } from "./wagmi-config.js";

/** Drive the signing loop without a real wallet: the extension is mocked. */
vi.mock("wagmi/actions", () => ({
  disconnect: vi.fn(),
  getAccount: vi.fn(() => ({})),
  signTypedData: vi.fn(),
}));

const TEST_ADDRESS = "0x38c80359CD99245f2Fae9C284579A10Af7a41932";
const FAKE_SIGNATURE = ("0x" + "ab".repeat(65)) as Hex;

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** All app source files, excluding tests — the mock-data and key scans run over these. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      out.push(...sourceFiles(full));
    } else if (
      (full.endsWith(".ts") || full.endsWith(".tsx")) &&
      !full.endsWith(".test.ts") &&
      !full.endsWith(".test.tsx")
    ) {
      out.push(full);
    }
  }
  return out;
}

describe("injected browser-extension wallet", () => {
  it("needs no WalletConnect project ID — none is read anywhere", () => {
    expect(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID).toBeUndefined();
    const files = sourceFiles(path.join(WEB_ROOT, "app")).concat(
      sourceFiles(path.join(WEB_ROOT, "lib")),
    );
    const hits = files.filter((f) =>
      readFileSync(f, "utf-8").includes("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID"),
    );
    expect(hits).toEqual([]);
  });

  it("has no injected wallet in this environment (no window.ethereum)", () => {
    // Vitest runs in Node: no browser, no extension.
    expect(hasInjectedWallet()).toBe(false);
  });

  it("the wagmi config is Base Sepolia only, injected connector, no project ID", () => {
    const config = getWagmiConfig();
    expect(config.chains.map((c) => c.id)).toEqual([84532]);
    expect(config.connectors.map((c) => c.id)).toEqual(["injected"]);
    expect(getConnectedAddress()).toBeNull();
  });

  it("refuses to sign when no wallet is connected, instead of faking a wallet", async () => {
    await expect(
      buildUserJobRequest({
        address: "0x38c80359CD99245f2Fae9C284579A10Af7a41932",
        budgetCents: 500,
        job: "research 10 competitors and write a one-page brief",
      }),
    ).rejects.toThrow(NO_WALLET_CONNECTED_MESSAGE);
  });
  it("the connect card offers a browser wallet and a no-extension state", () => {
    const card = readFileSync(
      path.join(WEB_ROOT, "app", "components", "ConnectWallet.tsx"),
      "utf-8",
    );
    expect(card).toContain("Connect browser wallet");
    expect(card).toContain("No wallet extension found in this browser");
    expect(card).toContain("metamask.io/download");
    expect(card).toContain("rainbow.me/download");
    expect(card).not.toContain("w3m-button");
  });

  it("no AppKit / WalletConnect wiring remains anywhere in the app", () => {
    const files = sourceFiles(path.join(WEB_ROOT, "app")).concat(
      sourceFiles(path.join(WEB_ROOT, "lib")),
    );
    const hits: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      for (const needle of [
        "@reown/appkit",
        "createAppKit",
        "WagmiAdapter",
        "w3m-button",
        "useAppKitAccount",
        "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
      ]) {
        if (content.includes(needle)) {
          hits.push(`${path.relative(WEB_ROOT, file)}: ${needle}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("no private keys in the app", () => {
  it("no web source file holds, generates, imports, or stores a user's private key", () => {
    const files = sourceFiles(path.join(WEB_ROOT, "app")).concat(
      sourceFiles(path.join(WEB_ROOT, "lib")),
    );
    expect(files.length).toBeGreaterThan(0);
    const banned = [
      "privateKey",
      "coven:user-wallet",
      "generateUserWallet",
      "Create my testnet wallet",
      "importUserWallet",
      "loadUserWallet",
    ];
    const hits: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      for (const needle of banned) {
        if (content.includes(needle)) {
          hits.push(`${path.relative(WEB_ROOT, file)}: ${needle}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("mock data removal", () => {
  it("every job input starts empty — the example is placeholder text only", () => {
    // The dashboard summon form and the public demo form are the
    // only places a job is typed. Both start empty.
    for (const file of [
      path.join(WEB_ROOT, "app", "app", "components", "SummonForm.tsx"),
      path.join(WEB_ROOT, "app", "demo", "page.tsx"),
    ]) {
      const content = readFileSync(file, "utf-8");
      // Empty input, example as grey placeholder.
      expect(content).toContain('useState("")');
      expect(content).toContain("placeholder={JOB_PLACEHOLDER}");
      // Never prefilled, never submitted as a job.
      expect(content).not.toContain('useState("research');
      expect(content).not.toContain("EXAMPLE_JOB");
      expect(content).not.toContain("useState(EXAMPLE_JOB)");
    }
  });

  it("the landing page has no summon form and no wallet card", () => {
    const landing = readFileSync(path.join(WEB_ROOT, "app", "page.tsx"), "utf-8");
    expect(landing).not.toContain("<form");
    expect(landing).not.toContain("summonCoven");
    expect(landing).not.toContain("UserWallet");
    expect(landing).toContain("/app");
    expect(landing).toContain("/demo");
  });

  it("no app source hardcodes a job, a balance, or a payment hash", () => {
    const files = sourceFiles(path.join(WEB_ROOT, "app")).concat(
      sourceFiles(path.join(WEB_ROOT, "lib")),
    );
    const hits: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      if (/0x[0-9a-fA-F]{64}/.test(content)) {
        hits.push(`${path.relative(WEB_ROOT, file)}: 64-hex private-key-shaped value`);
      }
      if (/job-demo-\d|job-mwo|job-mwn/.test(content)) {
        hits.push(`${path.relative(WEB_ROOT, file)}: hardcoded job id`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("signing progress and resume", () => {
  const jobInput = {
    address: TEST_ADDRESS,
    budgetCents: 500,
    job: "research 10 competitors and write a one-page brief",
  };

  beforeEach(() => {
    vi.mocked(getAccount).mockReset();
    vi.mocked(signTypedData).mockReset();
    vi.mocked(getAccount).mockImplementation(
      (() => ({ address: TEST_ADDRESS })) as unknown as typeof getAccount,
    );
    vi.mocked(signTypedData).mockResolvedValue(FAKE_SIGNATURE);
  });

  it("reports progress after each signature and returns all 4 authorizations", async () => {
    const progress: { done: number; total: number }[] = [];
    const request = await buildUserJobRequest({
      ...jobInput,
      onProgress: (p) => progress.push(p),
    });
    expect(request.authorizations).toHaveLength(HANDOFF_SIGNATURE_COUNT);
    expect(HANDOFF_SIGNATURE_COUNT).toBe(4);
    expect(request.payerAddress).toBe(TEST_ADDRESS);
    expect(progress).toEqual([
      { done: 1, total: 4 },
      { done: 2, total: 4 },
      { done: 3, total: 4 },
      { done: 4, total: 4 },
    ]);
    expect(vi.mocked(signTypedData)).toHaveBeenCalledTimes(4);
  });

  it("a rejection names the failed signature and keeps the signed ones", async () => {
    vi.mocked(signTypedData)
      .mockResolvedValueOnce(FAKE_SIGNATURE)
      .mockRejectedValueOnce(new Error("User rejected the request."));
    let caught: unknown;
    try {
      await buildUserJobRequest(jobInput);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(HandoffSigningError);
    const signingErr = caught as HandoffSigningError;
    expect(signingErr.failedIndex).toBe(1);
    expect(signingErr.total).toBe(4);
    expect(signingErr.rejected).toBe(true);
    expect(signingErr.message).toBe("Signature 2 of 4 was rejected in your wallet.");
    expect(signingErr.signedAuthorizations).toHaveLength(1);
  });

  it("resume continues from the failed signature without re-signing the rest", async () => {
    vi.mocked(signTypedData)
      .mockResolvedValueOnce(FAKE_SIGNATURE)
      .mockRejectedValueOnce(new Error("User rejected the request."));
    let caught: unknown;
    try {
      await buildUserJobRequest(jobInput);
    } catch (err) {
      caught = err;
    }
    const firstAttempt = caught as HandoffSigningError;
    expect(firstAttempt.signedAuthorizations).toHaveLength(1);

    // The wallet now approves everything: resume must sign only the 3 left.
    vi.mocked(signTypedData).mockResolvedValue(FAKE_SIGNATURE);
    const progress: { done: number; total: number }[] = [];
    const resumed = await buildUserJobRequest({
      ...jobInput,
      onProgress: (p) => progress.push(p),
      resumeFrom: firstAttempt.signedAuthorizations,
    });
    expect(resumed.authorizations).toHaveLength(4);
    // The first authorization is the one signed in the first attempt, reused as-is.
    expect(resumed.authorizations[0]).toEqual(firstAttempt.signedAuthorizations[0]);
    // 2 signing attempts in the first run + 3 in the resume = 5 prompts, not 8.
    expect(vi.mocked(signTypedData)).toHaveBeenCalledTimes(5);
    // Progress restarts from the resumed count.
    expect(progress).toEqual([
      { done: 1, total: 4 },
      { done: 2, total: 4 },
      { done: 3, total: 4 },
      { done: 4, total: 4 },
    ]);
  });

  it("a non-rejection failure names the failed signature without wallet internals", async () => {
    vi.mocked(signTypedData)
      .mockResolvedValueOnce(FAKE_SIGNATURE)
      .mockRejectedValueOnce(new Error("chainId should be same as current chainId"));
    let caught: unknown;
    try {
      await buildUserJobRequest(jobInput);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(HandoffSigningError);
    const signingErr = caught as HandoffSigningError;
    expect(signingErr.failedIndex).toBe(1);
    expect(signingErr.rejected).toBe(false);
    expect(signingErr.message).toBe("Signature 2 of 4 could not be signed.");
    expect(signingErr.message).not.toContain("chainId");
    expect(signingErr.message).not.toContain("viem");
  });

  it("resumeFrom longer than the job needs is refused plainly", async () => {
    const tooMany = Array(5).fill({}) as unknown as PaymentPayload[];
    await expect(
      signHandoffAuthorizations({ address: TEST_ADDRESS, budgetCents: 500, resumeFrom: tooMany }),
    ).rejects.toThrow("Cannot resume signing");
  });
});
