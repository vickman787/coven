import { describe, expect, it } from "vitest";
import { POST as requestNonce } from "./auth/nonce/route.js";
import { POST as verify } from "./auth/verify/route.js";
import { GET as readSession } from "./auth/session/route.js";
import { POST as signOut } from "./auth/signout/route.js";
import { PATCH as updateProfile } from "./auth/profile/route.js";

function jsonRequest(url: string, body: unknown, cookie?: string): Request {
  return new Request(url, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    method: "POST",
  });
}

/**
 * Sign in as a throwaway wallet: ask for a nonce, sign the exact
 * login message with the throwaway key, verify, and keep the
 * session cookie. The key is generated inside the test and
 * discarded — no app code ever holds a user's key.
 */
async function signInAsThrowaway(): Promise<{ address: string; cookie: string }> {
  const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(generatePrivateKey());
  const nonceRes = await requestNonce(
    jsonRequest("http://localhost/api/auth/nonce", { address: account.address }),
  );
  expect(nonceRes.status).toBe(200);
  const { message } = (await nonceRes.json()) as { message: string };
  // The message carries the lowercased address; the wallet's
  // checksummed address differs in case only.
  expect(message.toLowerCase()).toContain(account.address.toLowerCase());
  const signature = await account.signMessage({ message });
  const verifyRes = await verify(
    jsonRequest("http://localhost/api/auth/verify", {
      address: account.address,
      message,
      signature,
    }),
  );
  expect(verifyRes.status).toBe(200);
  const setCookie = verifyRes.headers.get("set-cookie") ?? "";
  expect(setCookie).toContain("coven_session=");
  const cookie = setCookie.split(";")[0]!;
  return { address: account.address, cookie };
}

describe("POST /api/auth/nonce", () => {
  it("rejects a malformed address", async () => {
    const res = await requestNonce(
      jsonRequest("http://localhost/api/auth/nonce", { address: "not-an-address" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns a message carrying the address and a nonce", async () => {
    const address = "0x1111111111111111111111111111111111111111";
    const res = await requestNonce(
      jsonRequest("http://localhost/api/auth/nonce", { address }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { message: string; nonce: string };
    expect(data.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(data.message).toContain(address);
    expect(data.message).toContain(data.nonce);
  });
});

describe("POST /api/auth/verify", () => {
  it("rejects a signature from a different wallet", async () => {
    const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
    const owner = privateKeyToAccount(generatePrivateKey());
    const attacker = privateKeyToAccount(generatePrivateKey());
    const nonceRes = await requestNonce(
      jsonRequest("http://localhost/api/auth/nonce", { address: owner.address }),
    );
    const { message } = (await nonceRes.json()) as { message: string };
    // The attacker signs the owner's login message.
    const signature = await attacker.signMessage({ message });
    const res = await verify(
      jsonRequest("http://localhost/api/auth/verify", {
        address: owner.address,
        message,
        signature,
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a replayed login message — the nonce is single-use", async () => {
    const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(generatePrivateKey());
    const nonceRes = await requestNonce(
      jsonRequest("http://localhost/api/auth/nonce", { address: account.address }),
    );
    const { message } = (await nonceRes.json()) as { message: string };
    const signature = await account.signMessage({ message });
    const first = await verify(
      jsonRequest("http://localhost/api/auth/verify", {
        address: account.address,
        message,
        signature,
      }),
    );
    expect(first.status).toBe(200);
    const replay = await verify(
      jsonRequest("http://localhost/api/auth/verify", {
        address: account.address,
        message,
        signature,
      }),
    );
    expect(replay.status).toBe(401);
  });

  it("signs in and issues a session cookie", async () => {
    const { address, cookie } = await signInAsThrowaway();
    const res = await readSession(
      new Request("http://localhost/api/auth/session", {
        headers: { cookie },
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      address?: string;
      signedIn: boolean;
    };
    expect(data.signedIn).toBe(true);
    expect(data.address?.toLowerCase()).toBe(address.toLowerCase());
  });
});

describe("GET /api/auth/session", () => {
  it("reports signed out with no cookie", async () => {
    const res = await readSession(new Request("http://localhost/api/auth/session"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { signedIn: boolean };
    expect(data.signedIn).toBe(false);
  });
});

describe("POST /api/auth/signout", () => {
  it("ends the session — the cookie stops working", async () => {
    const { cookie } = await signInAsThrowaway();
    const res = await signOut(
      new Request("http://localhost/api/auth/signout", {
        headers: { cookie },
        method: "POST",
      }),
    );
    expect(res.status).toBe(200);
    const after = await readSession(
      new Request("http://localhost/api/auth/session", {
        headers: { cookie },
      }),
    );
    const data = (await after.json()) as { signedIn: boolean };
    expect(data.signedIn).toBe(false);
  });
});

describe("PATCH /api/auth/profile", () => {
  it("requires sign-in", async () => {
    const res = await updateProfile(
      jsonRequest("http://localhost/api/auth/profile", { displayName: "Vick" }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects an empty display name", async () => {
    const { cookie } = await signInAsThrowaway();
    const res = await updateProfile(
      jsonRequest("http://localhost/api/auth/profile", { displayName: "  " }, cookie),
    );
    expect(res.status).toBe(400);
  });

  it("sets the display name and the session shows it", async () => {
    const { address, cookie } = await signInAsThrowaway();
    const res = await updateProfile(
      jsonRequest("http://localhost/api/auth/profile", { displayName: "Vick" }, cookie),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { displayName: string | null };
    expect(data.displayName).toBe("Vick");
    const session = await readSession(
      new Request("http://localhost/api/auth/session", {
        headers: { cookie },
      }),
    );
    const sessionData = (await session.json()) as {
      address?: string;
      displayName?: string | null;
    };
    expect(sessionData.address?.toLowerCase()).toBe(address.toLowerCase());
    expect(sessionData.displayName).toBe("Vick");
  });
});
