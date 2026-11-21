"use client";

/** Client-side session helpers: read the session, sign out. */
export interface ClientSession {
  address: string;
  displayName: string | null;
  signedIn: boolean;
}

export async function fetchSession(): Promise<ClientSession> {
  const res = await fetch("/api/auth/session");
  if (!res.ok) return { address: "", displayName: null, signedIn: false };
  const data = (await res.json()) as {
    address?: string;
    displayName?: string | null;
    signedIn: boolean;
  };
  return {
    address: data.address ?? "",
    displayName: data.displayName ?? null,
    signedIn: data.signedIn,
  };
}

export async function signOut(): Promise<void> {
  await fetch("/api/auth/signout", { method: "POST" });
}
