# Kiro Crew — Coven agents

The 5 agents, in `src/`:

- **Summoner** (`agents.ts`): takes the job, splits the budget into scoped
  allocations (Seeker 40%, Weaver 40%, Keeper 10%, Warden 10%).
- **Seeker** (`research.ts`): researches with the Wikipedia search API —
  real HTTP, no key. Derives up to 3 queries from the job text.
- **Weaver** (`agents.ts`): writes the one-page brief from the sources the
  Seeker actually found. No invented claims or sources.
- **Keeper**: holds the ledger — reserves before each payment, pays through
  x402, confirms or leaves unresolved (see `run-job.ts`).
- **Warden** (`agents.ts`): verifies the brief (has sources, has a sources
  section) and the ledger invariant. On failure it revokes the agent and
  the job fails honestly.

## Run one job end to end

```bash
pnpm --filter @coven/crew build
pnpm --filter @coven/crew run-job [--job "..."] [--budget 500]
```

The brief is saved to `apps/crew/runs/<job-id>.md`. The ledger uses
pg-mem by default; set `COVEN_USE_POSTGRES=1` with `DATABASE_URL` for a
real server. Payments use real x402 when `COVEN_PAYER_PRIVATE_KEY` +
`COVEN_PAYEE_ADDRESS` are set in `.env`; otherwise they are recorded
unresolved with the reason shown, never as settled.

## Tests

```bash
pnpm --filter @coven/crew test
```

7 pass: end-to-end settled, end-to-end unresolved, no-sources failure,
throwing executor, and research parsing/dedup.
