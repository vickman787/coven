# Judge path — try it in 30 seconds

No login, no signup, no help from the builder.

1. Open the live app.
2. Click **Summon a Coven**.
3. Enter a job, for example: `research 10 competitors and write a one-page brief`
4. Set a budget: **$5.00** (allowed $1.00–$10.00, test USDC on Base Sepolia).
5. Watch the agents work on **The Coven at Work**: each agent card shows its
   role, its scoped budget, and how much it has spent. The page updates
   live while the job runs.
6. Open **The Ledger**: settled, reserved, unresolved, and approved totals,
   with the rule in plain text — settled + reserved + unresolved =
   approved budget. Click any payment to see its x402 hash and a link to
   the transaction on Blockscout.
7. Open **The Result**: the finished one-page brief, its sources, and the
   final ledger balanced. Share the job link — anyone who opens it can
   audit the same job.

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
