# Architecture

See `.kiro/specs/coven/design.md` for the full design.

```
┌────────────────────────────────────────────────────────────┐
│ apps/web (Next.js 16, React 19) — the judge path           │
│  POST /api/jobs → create job, run in background (after())  │
│  GET  /api/jobs/[id] → status, totals, payments, brief     │
│  POST /api/jobs/[id]/revoke → Warden revokes an agent      │
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
  Railway Postgres, so jobs survive across serverless instances.
- **No login anywhere** on the judge path. Jobs are addressed by an
  unguessable id in the URL (`?job=...`).

## Tests

34 pass, 3 skipped at the end of Step 3; Step 4 added 6 web API tests
and 2 ledger tests (job status + briefs). Run everything with
`pnpm test` from the repo root. Live facilitator tests are gated on
`COVEN_LIVE_X402=1` and never move money (fresh unfunded wallet).
