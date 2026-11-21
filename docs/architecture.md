# Architecture

See `.kiro/specs/coven/design.md` for the full design.

```
┌────────────────────────────────────────────────────────────┐
│ apps/web (Next.js 16, React 19) — product MVP              │
│  /                  landing only                            │
│  /signin            sign in with your wallet (SIWE-style)   │
│  /app               Dashboard: balance, counts, summon       │
│  /app/jobs          your jobs, status filters               │
│  /app/jobs/<id>/agents|ledger|result — one job's spaces     │
│  /app/wallet        address, balance, payment history       │
│  /app/settings      display name, network, sign out         │
│  /demo              judge/demo mode — no sign-in, no wallet  │
│  /workspace/jobs/<id>/… — public job viewer (share links)   │
│  POST /api/auth/nonce|verify → login message + session      │
│  GET  /api/auth/session · POST /api/auth/signout            │
│  PATCH /api/auth/profile → display name                     │
│  GET  /api/dashboard → counts, totals, recent jobs          │
│  GET  /api/wallet → payment history                         │
│  POST /api/jobs → create job, run in background (after())  │
│  GET  /api/jobs → list jobs, ?payer=0x… or ?mine=1          │
│  GET  /api/jobs/[id] → status, totals, payments, brief     │
│  POST /api/jobs/[id]/revoke → Warden revokes an agent       │
│    (user jobs: owner only)                                  │
│  Wallet: injected browser extension (wagmi) — MetaMask,     │
│    Rainbow, Coinbase Wallet. No WalletConnect, no QR code,  │
│    no project ID. The extension signs EIP-3009 auths and    │
│    the login message. No private key anywhere in the app.   │
│  Accounts: Postgres accounts + sessions (30 days), nonces   │
│    (10 min, single-use). Address is the identity.           │
└──────────────┬───────────────────────────────┬─────────────┘
               │                               │
     ┌─────────▼────────┐             ┌────────▼─────────┐
     │ apps/crew        │             │ packages/ledger  │
     │ 5 Kiro Crew      │             │ PostgresLedger   │
     │ agents + runner  │             │ atomic reserves, │
     │ Seeker: Wikipedia│             │ idempotent pays, │
     │ Weaver: brief    │             │ job_results      │
     └─────────┬────────┘             └────────┬─────────┘
               │                               │
     ┌─────────▼────────┐                       │
     │ packages/payments│                       │
     │ x402 v2, exact,  │                       │
     │ EIP-3009, viem,  │                       │
     │ facilitator      │                       │
     │ x402.org         │                       │
     └──────────────────┘                       │
                                                │
                              PostgreSQL (Railway in prod,
                              pg-mem locally)
```

## Money flow

1. The user approves a budget (integer cents, $1.00–$10.00).
2. The Keeper reserves each agent's share in one Postgres transaction
   (`SELECT ... FOR UPDATE` on the job row, invariant checked before
   commit, plus an in-process mutex for pg-mem).
3. An agent works, then the Keeper converts its reservation into an
   unresolved payment (`payFromReservation`, atomic, no double count).
4. The x402 executor signs an EIP-3009 authorization and asks the
   facilitator to verify, then settle. Only `success: true` with a
   transaction hash becomes settled (`confirmPayment`). Anything else
   stays unresolved with the facilitator's reason.
5. The Warden verifies the brief and the ledger; on failure it revokes
   the agent, releasing its reserved budget.

## Where state lives

- **PostgreSQL** is the source of truth: jobs, reservations, payments,
  revocations, job_results (the brief). The web UI polls
  `GET /api/jobs/[id]`, which reads the ledger — never browser state.
- **In-memory** only for the running job's executor and the pg-mem
  fallback used locally. On the deployed app `DATABASE_URL` points at
  Supabase Postgres, so jobs survive across serverless instances.
  Signed user authorizations also live in server memory only, and
  are deleted after the job runs.
- **No login anywhere** on the judge path. Jobs are addressed by an
  unguessable id in the URL (`/workspace/jobs/<id>/agents`; old
  `/jobs/<id>` and `?job=<id>` links redirect there).

## Tests

88 pass, 3 skipped (ledger 25+1, payments 31+2, crew 7, web 25).
Run everything with `pnpm test` from the repo root. Live facilitator tests are gated on
`COVEN_LIVE_X402=1` and never move money (fresh unfunded wallet).
