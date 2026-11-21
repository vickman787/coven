/** Money formatting helpers. Server-safe: no React, no hooks. */

export function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export const EXPLORER_TX = (hash: string) =>
  `https://base-sepolia.blockscout.com/tx/${hash}`;
