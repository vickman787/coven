# Coven — Tasks

## Step 1 — Spec and skeleton (Days 1–2) — this step

- [x] Write `.kiro/specs/coven/requirements.md`, `design.md`, and `tasks.md`
- [x] Write `.kiro/steering/ledger-rules.md` and `money-rules.md`
- [ ] Set up the pnpm monorepo, Next.js web app, and Postgres
- [ ] Make Screen 1 live: "Summon a Coven", job input, $5.00 budget, no login
- [ ] Add `.env.example`, `docker-compose.yml`, README, LICENSE, SECURITY
- [ ] Run the build and typecheck, and report what runs and what does not
- [ ] Stop and wait for the user before Step 2

## Step 2 — Ledger first (Days 3–5) — DONE 2026-11-19

- [x] Build `packages/ledger` with atomic reservations, idempotency, and reconciliation
- [x] Write property-based tests for the ledger first
- [x] Prove the invariant settled + reserved + unresolved <= approved budget under concurrency
- [x] No UI until the ledger invariant holds
- Result: 14 tests pass, 1 skipped (real-Postgres test, needs DATABASE_URL). See `packages/ledger/README.md`.

## Step 3 — Payments and crew (Days 6–8) — DONE 2026-11-19

- [x] Add real x402 payments in `packages/payments`
- [x] Add the 5 Kiro Crew agents in `apps/crew`
- [x] Get one full job working end to end: job in, brief out, ledger balanced
- Result: 34 tests pass, 3 skipped (ledger 17+1, payments 10+2 live, crew 7).
  End-to-end CLI run (`pnpm --filter @coven/crew run-job`) completes: brief
  written from 10 real Wikipedia sources, ledger $0 settled + $0 reserved +
  $5.00 unresolved = $5.00 approved. Payments are unresolved because the
  testnet wallet is unfunded — the live facilitator answered
  `invalid_exact_evm_insufficient_balance`, proving the signed payload is
  valid. Fund the wallet at https://faucet.circle.com (USDC, Base Sepolia)
  and re-run to settle for real.
- **Settled for real 2026-11-19:** after the user funded the wallet with 20
  test USDC, `job-demo-4` settled all 4 payments onchain — $5.00 settled,
  $0 unresolved. Hashes are in the root README. An earlier run (`job-demo-3`)
  settled 1 of 4 ($0.50) while the other 3 failed on facilitator network
  timeouts — the facilitator is flaky/slow from this VM, retries work.

## Step 4 — Judge path and polish (Days 9–11) — DONE 2026-11-19, except deploy

- [x] Make the 30-second judge path work with no login
- [x] Add Screens 2, 3, and 4, the audit view, and the revocation flow
- [ ] Deploy to Vercel and Railway — blocked: the GitHub connector cannot
  create repos (403), so the user must create the empty public repo
  `coven` on github.com first, then the snapshot push and the Vercel +
  Railway deploy can run.

Result: web API (POST /api/jobs, GET /api/jobs/[id], POST revoke, background
run via Next `after()`), Screens 2–4 + audit view + revoke flow, ledger
gained `job_results` (saveBrief/getBrief/updateJobStatus/getJob). Tests:
ledger 19+1, web API 6 pass (total 42 pass, 3 skipped). Local production
build passes; judge path verified through the web API (job done, brief
saved, 3 of 4 payments settled with real hashes, 1 unresolved, ledger
balanced, revoke works). Docs: `docs/judge-path.md`, `docs/architecture.md`.
Local git repo initialized (73 files staged, .env/node_modules/dist
excluded, .kiro NOT ignored). The one binary file
`docs/coven-ui-preview.png` is excluded from the connector push
(push_files is UTF-8 only). Local testing: production server runs on
:3000 with the real wallet; tunnels from this VM are blocked (trycloudflare
TLS error, localtunnel silent, localhost.run SSH reset by the egress
proxy) and the cloud browser cannot reach VM localhost, so the user
needs the Vercel link to test from their phone.

## Step 5 — Proof and video (Days 12–13)

- [ ] Run the full test suite, target 100+ tests
- [ ] Record the demo video under 3 minutes
- [ ] Write the README with live link, test count, and payment hash
- [ ] Write the Kiro write-up

## Step 6 — Submit (Day 14)

- [ ] Submit early on Devpost, then fix only what breaks
- [ ] Do not start a new feature on the last day
