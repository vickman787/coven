# Ledger

PostgreSQL-backed, integer cents only.

## Run the tests

```bash
pnpm --filter @coven/ledger test
```

The default suite runs against **pg-mem**, an in-memory PostgreSQL
emulator, so it needs no server. It covers:

- Ledger invariant: settled + reserved + unresolved <= approved budget
- Idempotency: same reservation / settle / confirm twice moves money once
- Atomic reservation race: two agents racing for the last dollar, only one wins
- Revocation: revoked agent cannot spend, reserved budget is released
- Reconciliation: uncertain payments stay unresolved until confirmed or released
- Property-based tests (fast-check, 25 runs): random operation sequences
  never break the invariant, and no payment is settled twice

## Run against a real PostgreSQL server

```bash
# Start Postgres (docker-compose in the repo root, or a local install)
docker compose up -d postgres
# or: service postgresql start

export DATABASE_URL=postgres://coven:coven@localhost:5432/coven
pnpm --filter @coven/ledger test
```

`ledger.postgres.test.ts` is skipped unless `DATABASE_URL` is set.
It runs the race test against the real server, where
`SELECT ... FOR UPDATE` is the cross-process guarantee.

## How atomicity works

- Every money mutation runs in a single transaction.
- The job row is locked with `SELECT ... FOR UPDATE` inside that
  transaction, and the invariant is checked before the write commits.
- An in-process mutex serializes money mutations in the same process
  (pg-mem does not block on row locks the way real Postgres does;
  the mutex closes that gap in tests, and the row lock closes it
  across processes in production).
- Payments are idempotent on `idempotency_key` (unique in the database).
