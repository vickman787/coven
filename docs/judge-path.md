# Judge path — try it in 30 seconds

No login, no signup, no help from the builder.

1. Open the live app — the landing page.
2. Click **Try the demo**.
3. Enter a job (the input starts empty; the example text is only a
   placeholder), for example: `research 10 competitors and write a one-page brief`
4. Set a budget: **$5.00** (allowed $1.00–$10.00, test USDC on Base Sepolia).
5. Click **Summon a Coven** — no wallet needed, the job runs on the
   demo wallet, labelled as such. You land on **Agents at Work**:
   each agent card shows its role, its scoped budget, and how much it
   has spent. The page updates live while the job runs.
6. Open **The Ledger** (its own space, linked from the job): settled,
   reserved, unresolved, and approved totals, with the rule in plain
   text — settled + reserved + unresolved = approved budget. Click any
   payment to see its x402 hash and a link to the transaction on
   Blockscout.
7. Open **The Result**: the finished one-page brief, its sources, and
   the final ledger balanced. Share the job link — anyone who opens it
   can audit the same job.

## What a judge can check

- **A real payment:** every settled payment has an x402 hash. Click it to
  see the `transferWithAuthorization` transaction on Base Sepolia.
  Example (job-demo-4, Nov 19 2026): summoner → seeker $2.00,
  `0xa1fa361af525ab58c45c9d55ba507b5db81f68189cf14e7d1e514f0b11ccbbbd`.
- **The ledger adds up:** the totals are read from PostgreSQL, not
  computed in the browser. An unresolved payment is shown as unresolved,
  never as settled.
- **Revocation works:** on The Coven at Work, revoke any agent. Its
  reserved budget is released back to the job and its unresolved
  payments become revoked.

## Known limits (honest)

- The demo budget is capped at $10.00 and the crew is 5 agents.
- Agents run on Base Sepolia testnet; the USDC has no value.
- The x402 facilitator is sometimes slow or drops a request from some
  networks. A payment that fails that way stays **unresolved** in the
  ledger — the job still completes and the brief is still delivered.
  We do not blindly retry a payment, because a retry after a lost
  settlement response could pay twice; a retry needs an onchain
  reconciliation check first (future work).
- The demo job "research 10 competitors" names no product, so the
  Seeker's Wikipedia sources are generic. Give the job a topic
  ("research 10 AI note-taking apps") for a sharp brief.

## Product MVP (added 2026-11-21)

The judge path above is unchanged in speed — landing → demo →
summon, no login — but the app is now a full product, not a demo
page: `/signin` signs in with your wallet (the address is the
account, sessions in Postgres), `/app` is the Dashboard, `/app/jobs`
your jobs, `/app/wallet` your wallet and payment history,
`/app/settings` display name and sign-out. User-funded jobs can only
be summoned — and their agents only revoked — by the signed-in
account whose wallet pays for them. Old links still work: `/workspace`
→ `/app`, `/workspace/history` → `/app/jobs`, `/jobs` → `/app/jobs`,
`/jobs/<id>` → the public job viewer, and `?job=<id>` forwards there
too. Agent cards say "complete" (not "paid") when a payment is
unresolved; "paid" is reserved for settled payments with a hash.

## Per-user wallets — browser wallet extension (added 2026-11-20)

A public user funds jobs from their OWN wallet, connected with the
injected browser extension (MetaMask, Rainbow, Coinbase Wallet) —
no WalletConnect, no QR code, no project ID. There is no
browser-generated wallet and no private key anywhere in the app:

1. Sign in at `/signin`: click **Connect browser wallet** and approve
   in your extension, then sign the login message. Your key never
   leaves the extension, and your wallet address becomes your
   account. If no extension is installed, the card says so and links
   to the install pages instead of faking a connection.
2. Fund the address with free test USDC at https://faucet.circle.com
   (USDC, Base Sepolia). The dashboard and wallet pages show the
   onchain balance.
3. Summon from the dashboard. The browser checks the balance first,
   then your extension signs one EIP-3009 authorization per handoff
   (4, amounts = the budget split) and sends only those signed
   payloads. The server validates them (signer, amounts, payee,
   nonce, validity window) and settles them with the facilitator. If
   the extension is on the wrong network, the card offers to switch
   it to Base Sepolia.
4. The Ledger shows whose wallet paid: the user's address, or "the
   demo wallet" for judge-path jobs. The two modes are never mixed.

No wallet setup is needed — there is no project ID to create and
nothing to configure. Mobile wallets without a browser extension
cannot connect this way.

Honest caveats: each payment is a self-transfer (the user's wallet
pays itself), the same model as the demo — so the test USDC is not
spent, but the onchain settlement from the user's wallet is real. An
unfunded wallet is rejected before any job is created (400,
insufficient test USDC); if the balance check cannot reach the
network, the job may still be created and the facilitator will reject
the payments, which then stay unresolved in the ledger. Signed
authorizations live in server memory only, never in Postgres, and are
deleted after the job runs. Accounts exist now (wallet-based, Postgres
sessions); no mainnet, one job type.

## Mock data — cleared 2026-11-20

The app shows only real data: jobs from the ledger, balances from
the chain, payments with real hashes or none at all. The job input
starts empty (the example is placeholder text only); history and
agents show real empty states ("No jobs yet", "No job running")
when there is nothing to show. Test fixtures in `*.test.ts` files
and the real historical payment hashes in the README are not app
data and were left alone.
