import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  NO_WALLET_CONNECTED_MESSAGE,
  buildUserJobRequest,
  getConnectedAddress,
} from "./injected-wallet.js";
import { getWagmiConfig, hasInjectedWallet } from "./wagmi-config.js";

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
  it("the workspace job input starts empty — the example is placeholder text only", () => {
    const workspace = readFileSync(
      path.join(WEB_ROOT, "app", "workspace", "page.tsx"),
      "utf-8",
    );
    // Empty input, example as grey placeholder.
    expect(workspace).toContain('useState("")');
    expect(workspace).toContain("placeholder={JOB_PLACEHOLDER}");
    // Never prefilled, never submitted as a job.
    expect(workspace).not.toContain('useState("research');
    expect(workspace).not.toContain("EXAMPLE_JOB");
    expect(workspace).not.toContain("useState(EXAMPLE_JOB)");
  });

  it("the landing page has no summon form and no wallet card", () => {
    const landing = readFileSync(path.join(WEB_ROOT, "app", "page.tsx"), "utf-8");
    expect(landing).not.toContain("<form");
    expect(landing).not.toContain("summonCoven");
    expect(landing).not.toContain("UserWallet");
    expect(landing).toContain("/workspace");
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
