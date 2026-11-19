# Payments — real x402 v2 on Base Sepolia (testnet)

## What this is

- x402 v2, `exact` scheme, EIP-3009 `transferWithAuthorization` (USDC).
- Network `eip155:84532` (Base Sepolia), USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.
- Facilitator: https://x402.org/facilitator (free, no key, testnets only).
- Signing with viem. The facilitator pays the gas; the payer only signs.

## Money

1 USDC = 1,000,000 atomic units = 100 cents, so 1 cent = 10,000 units.
`centsToAtomicUnits` does that conversion with integers only.

## Wallet (testnet only)

Generate a wallet:

```bash
pnpm --filter @coven/payments generate-wallet
```

Save the private key in `~/workspace/coven/.env` as
`COVEN_PAYER_PRIVATE_KEY` — never commit it, never put it in
`.env.example`. The payer address is
`0x38c80359CD99245f2Fae9C284579A10Af7a41932`.

Fund it with 20 free test USDC (no account, captcha required):
https://faucet.circle.com — choose USDC, Base Sepolia, paste the address.
The payer needs test USDC, not test ETH.

## What "settled" means here

A payment is only reported settled when the facilitator's `/settle`
returns `success: true` with a transaction hash. Anything else —
verification failure, insufficient balance, timeout, `settlement_pending`
— is recorded **unresolved** with the facilitator's reason, so the
ledger never claims a settlement that did not happen.

Verified live 2026-11-19: the facilitator answered
`invalid_exact_evm_insufficient_balance` for a signed authorization
from the unfunded Coven wallet. That error proves the signature and
payload shape are valid — the check failed on balance, not on the
signature. Fund the wallet and the same code settles for real.

## Tests

```bash
pnpm --filter @coven/payments test
```

10 pass, 2 skipped. The skipped tests are live facilitator checks,
run with `COVEN_LIVE_X402=1`. They never move money: the wallet is
freshly generated and unfunded.
