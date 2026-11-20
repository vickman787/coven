# Coven

A Kiro Crew of AI agents that does a job together, where each agent has a scoped budget and pays the next agent per task with x402, and every payment is recorded in an audit ledger a judge can verify in 30 seconds.

Kiroween 2026, Frankenstein category. Deadline: Friday, December 4, 2026 at 2:00 PM PT.

## Status — Step 4 done, except deploy

Step 4 is done: the judge path works end to end in the web app, with no
login. **81 tests pass, 3 skipped** (ledger 25+1, payments 31+2 live,
crew 7, web 18).

## Public v1 — added 2026-11-20, judge path kept intact

The home Summon flow, the $5.00 example job, no-login summon, and the
`?job=<id>` link all work exactly as before. Added around them:

- **Home as a landing page:** Summon stays the hero; below it, How it
  works, Meet the Coven (the 5 agents), How the ledger works, and an
  honest-limits section.
- **Jobs history:** `/jobs` lists recent jobs from the ledger (newest
  first, status, budget, spent, date) via new `GET /api/jobs`
  (`PostgresLedger.listJobs`, limit 1–100). Jobs summoned in this
  browser are marked "yours on this device" from localStorage.
- **Clean job URLs:** `/jobs/<id>` shows the same Work / Ledger /
  Result tabs as `?job=<id>`; the Share button now copies the
  `/jobs/<id>` link.
- **Paid-label fix:** an agent is labelled "paid" only when its payment
  is settled with an x402 hash. A finished agent with an unresolved
  payment is labelled "complete" — work done, money not moved yet
  (`apps/web/lib/agent-status.ts`, tested).

Still NOT in public v1: accounts (no auth yet — history is public by
job link), and more job types than the research brief. Those are the
follow-up decisions after the Kiroween submission.

## Per-user wallets — added 2026-11-20

A public user can fund jobs from their OWN Base Sepolia testnet wallet
instead of the shared demo wallet. **Design: the private key never
leaves the user's browser.** "Create my testnet wallet" on the home
page generates a wallet in the browser (key in localStorage only);
fund it with free test USDC at https://faucet.circle.com (USDC, Base
Sepolia). When summoning, the browser checks the balance, then signs
one EIP-3009 authorization per handoff (4, amounts 40/40/10/10 of the
budget) and sends only those signed payloads. The server validates
them (signer, amounts, payee, nonce, 10-minute window) and settles
them via the facilitator; payloads live in server memory only and are
deleted after the job runs. The Ledger shows the payer address, or
"the demo wallet" for judge-path jobs. An unfunded wallet is rejected
before a job is created (400); a tampered authorization is rejected;
a user job never falls back to the shared wallet.

Honest caveat: each payment is a self-transfer — the user's wallet
pays itself, the same model as the demo — so test USDC is not spent,
but the onchain settlement from the user's wallet is real. Paying a
Coven payee or per-agent wallets would be a real charge and is not
what this version does. See `docs/judge-path.md` for the full flow.

- Live: `apps/web` — Screen 1 Summon, Screen 2 Coven at Work (5 agent
  cards, live polling, Revoke button), Screen 3 Ledger (totals, rule in
  plain text, payments with x402 hashes and Blockscout links), Screen 4
  Result (brief, sources, final ledger, share link). API: `POST /api/jobs`,
  `GET /api/jobs/[id]`, `POST /api/jobs/[id]/revoke`.
- End-to-end web run: `POST /api/jobs` then poll — job done, brief saved,
  3 of 4 payments settled with real hashes (0xbac1f97a…, 0x53ae2aad…,
  0x2bb300e4…), 1 unresolved, ledger $3.00 + $0 + $2.00 = $5.00 approved.
  Revoke verified through the API (warden revoked, totals unchanged).
- **Settled for real on 2026-11-19:** after the user funded the wallet with
  20 test USDC, `job-demo-4` settled all 4 payments onchain — **$5.00
  settled, $0 unresolved**, ledger balanced. Hashes (Base Sepolia):
  - summoner → seeker $2.00 — 0xa1fa361af525ab58c45c9d55ba507b5db81f68189cf14e7d1e514f0b11ccbbbd
  - seeker → weaver $2.00 — 0x816d8e998c3c74570b63b52a1518f482af23d6df3b6ec10b00d265631fc078a2
  - weaver → keeper $0.50 — 0x25e5681b59bcd6602e934dbbb26631f5c5b680ab2de893c08775fce35db8fad1
  - keeper → warden $0.50 — 0x20d63d7097677f15f806ceca16590b413bf6b1758e0976e8343dfdf3b8b1c1df
  (An earlier run, `job-demo-3`, settled 1 of 4 — $0.50 — while the other 3
  failed on network timeouts to the facilitator, so ~$5.50 of the $20 test
  USDC is spent. The facilitator is flaky/slow from this VM; retries work.)
- Not done yet: deploy to Vercel/Railway (needs the public GitHub repo
  first — see below), demo video.

## Judge path — try it in 30 seconds (target)

1. Open the live app.
2. Click "Summon a Coven" — no signup, no secret.
3. Enter a job: "research 10 competitors and write a one-page brief".
4. Set a budget: $5.00.
5. Watch the agents work, pay each other, and fill the ledger.
6. Click any payment to see its x402 payment hash, its amount, and its status.
7. Check the ledger total: settled + reserved + unresolved = approved budget.

## UI/UX

Dark, mystical, Halloween, but clean. Near-black #0B0B14, deep purple #7C3AED, gold #F5C518, pale ghost white #F8F7FF.

Canva design: https://canva.link/ga12x3grnq660jh

## Run it (Step 1)

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000

Postgres (for Step 2+):

```bash
cp .env.example .env
docker compose up -d postgres
```

## Repo layout

```
coven/
  .kiro/
    specs/coven/       # requirements.md, design.md, tasks.md
    steering/          # ledger-rules.md, money-rules.md, kiroween-writeup.md
    hooks/             # on-payment.json, on-test-fail.json
  apps/
    web/               # Next.js 16, React 19, Tailwind — the judge path
    crew/              # Kiro Crew agents (Step 3)
  packages/
    ledger/            # budget reservations, audit log (Step 2)
    payments/          # x402 client and server (Step 3, stub in Step 1)
    shared/            # types, Zod schemas, money in integer cents
  docs/
  tests/
```

`/.kiro` is at the root and is **not** in `.gitignore`, as Kiroween requires.

## Money rules

- Money is integer cents. No floating point.
- Payments are idempotent.
- Budget is reserved atomically before payment.
- settled + reserved + unresolved <= approved budget, always.
- An uncertain payment is unresolved, never settled.
