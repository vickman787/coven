import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { recoverMessageAddress } from "viem";
import { getLedger } from "./coven";
import { shortAddress } from "@coven/payments/user-wallet";

/**
 * Wallet-based accounts. Connecting the browser extension IS the
 * account: the wallet address is the identity. There is no email,
 * no password, no OAuth — the user signs a login message with
 * their extension (SIWE-style), the server verifies the signature
 * against a single-use nonce, and a session cookie is issued.
 *
 * No private key is ever sent to the server or stored anywhere:
 * the server only ever sees the address, the message, and the
 * signature. Sessions live in Postgres (30 days); nonces live in
 * Postgres (10 minutes, single-use).
 */

export const SESSION_COOKIE = "coven_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function isValidAddress(address: unknown): address is string {
  return typeof address === "string" && ADDRESS_RE.test(address);
}

/** The exact message the wallet signs at sign-in. */
export function buildLoginMessage(input: { address: string; nonce: string }): string {
  return [
    "Coven — sign in with your wallet",
    "",
    "Sign in to Coven with this wallet. This proves you own the wallet — no password, no email.",
    "",
    `Address: ${input.address}`,
    `Nonce: ${input.nonce}`,
    `Issued: ${new Date().toISOString()}`,
  ].join("\n");
}

function parseNonce(message: string): string | null {
  const match = /^Nonce: ([0-9a-f]+)$/m.exec(message);
  return match?.[1] ?? null;
}

function parseAddress(message: string): string | null {
  const match = /^Address: (0x[0-9a-fA-F]{40})$/m.exec(message);
  return match?.[1] ?? null;
}

/**
 * Verify a signed login message. Returns the address when the
 * signature recovers to it AND the nonce in the message is the
 * live single-use nonce for that address; otherwise null. The
 * nonce is consumed on success (and on a failed attempt with a
 * live nonce, so it cannot be replayed).
 */
export async function verifyLoginSignature(input: {
  address: string;
  message: string;
  signature: string;
}): Promise<string | null> {
  const address = input.address.toLowerCase();
  const messageAddress = parseAddress(input.message);
  if (!messageAddress || messageAddress.toLowerCase() !== address) return null;
  const nonce = parseNonce(input.message);
  if (!nonce) return null;
  const ledger = await getLedger();
  const consumed = await ledger.consumeLoginNonce(address, nonce);
  if (!consumed) return null;
  let recovered: string;
  try {
    recovered = await recoverMessageAddress({
      message: input.message,
      signature: input.signature as `0x${string}`,
    });
  } catch {
    return null;
  }
  return recovered.toLowerCase() === address ? address : null;
}

function readSessionTokenFromCookieHeader(request: Request): string | null {
  const header = request.headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)coven_session=([^;]+)/.exec(header);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export interface SessionAccount {
  address: string;
  displayName: string | null;
}

/** Session address from a route-handler Request (reads the Cookie header — testable). */
export async function getSessionAddressFromRequest(
  request: Request,
): Promise<string | null> {
  const token = readSessionTokenFromCookieHeader(request);
  if (!token) return null;
  const ledger = await getLedger();
  const session = await ledger.getSession(token);
  return session ? session.address : null;
}

/** Session account from a route-handler Request. */
export async function getSessionAccountFromRequest(
  request: Request,
): Promise<SessionAccount | null> {
  const address = await getSessionAddressFromRequest(request);
  if (!address) return null;
  const ledger = await getLedger();
  const account = await ledger.getAccount(address);
  return account
    ? { address: account.address, displayName: account.displayName }
    : { address, displayName: null };
}

/** Session account inside a server component (reads next/headers cookies). */
export async function getSessionAccount(): Promise<SessionAccount | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const ledger = await getLedger();
  const session = await ledger.getSession(token);
  if (!session) return null;
  const account = await ledger.getAccount(session.address);
  return account
    ? { address: account.address, displayName: account.displayName }
    : { address: session.address, displayName: null };
}

/** Set the session cookie on a response (httpOnly, 30 days). */
export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    ...(process.env.NODE_ENV === "production" ? { secure: true } : {}),
  });
}

/** Clear the session cookie on a response. */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
  });
}

/** Display name for the UI: the name the user set, or their short address. */
export function displayNameOf(account: SessionAccount): string {
  return account.displayName ?? shortAddress(account.address);
}
