# Coven — Kiro Spec and Build Plan

## One sentence

Coven is a Kiro Crew of AI agents that does a job together, where each agent has a scoped budget and pays the next agent per task with x402, and every payment is recorded in an audit ledger a judge can verify in 30 seconds.

## Hackathon

- **Hackathon:** Kiroween 2026
- **Category:** Frankenstein — stitch together a chimera of technologies into one app
- **Deadline:** Friday, December 4, 2026 at 2:00 PM Pacific Time (11:00 PM WAT)
- **Prizes:** $100,000+ in total. 1st $30,000, 2nd $20,000, 3rd $10,000, Best Frankenstein $5,000
- **Rule to respect:** only new projects built October 30 to December 4, 2026 are eligible

## The narrow job

A user posts one job, for example "research 10 competitors and write a one-page brief".

Coven breaks the job into steps, assigns each step to a specialist agent, and each agent pays the next agent for its work. No agent can spend more than its budget. No payment happens twice. Every step, payment, and result is in the ledger.

The user gets the finished brief. The judge gets proof that the money moved correctly.

## The Coven — agent roles

- **Summoner:** takes the job, breaks it into steps, and sets the total budget
- **Seeker:** researches and gathers sources
- **Weaver:** writes and assembles the result
- **Keeper:** holds the ledger, reserves budget before any payment, and enforces the rule settled + reserved + unresolved <= approved budget
- **Warden:** verifies each step, revokes a bad agent, and stops payment on failure

Each agent is a Kiro Crew agent with a clear role, a scoped budget, and a revocation path.

## Money flow

1. The user approves a job budget, for example $5.00 in USDC
2. The Keeper atomically reserves budget in PostgreSQL before a payment is authorised
3. An agent does its step, then pays the next agent with x402
4. The payment settles, or it fails and the reservation is released
5. The ledger shows settled, reserved, and unresolved amounts at all times
6. If an agent fails verification, the Warden revokes its session and its remaining budget returns to the job

Rules that must never break:

- Integer-based accounting for money, no floating point
- Idempotent payments, so a retry never pays twice
- Atomic reservations, so two agents cannot overspend the same budget at the same time
- Reconciliation for uncertain payments, so an unknown outcome is shown as unresolved, never as settled

## Tech stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind
- **API:** Hono, Zod, TypeScript
- **Database:** PostgreSQL, with atomic reservations
- **Payments:** x402, USDC
- **Agents:** Kiro Crew, with custom agents and MCP
- **Tests:** Vitest, with property-based testing for the ledger
- **Deploy:** Vercel for the web app, Railway for the API and Postgres
- **Monorepo:** pnpm workspaces

## UI/UX — Canva design

- **Canva design:** https://canva.link/ga12x3grnq660jh — 7-page presentation, design DAHbX1BeAKw
- **Theme:** dark, mystical, Halloween, but clean and professional. Spooky, not cluttered. A judge must understand it in 30 seconds.
- **Colours:** near-black background #0B0B14, deep purple #7C3AED, gold #F5C518, pale ghost white text #F8F7FF, muted grey #9A9AB0 for secondary text, green #22C55E for settled, amber #F59E0B for reserved, red #EF4444 for failed or revoked
- **Typography:** clean sans-serif, large numbers for money, small caps labels for agent roles and ledger states
- **Layout:** one clear action per screen, large primary button, cards for agents and payments, no sidebar clutter

### Screens

1. **Summon a Coven (Home):** heading "Summon a Coven", job input with the example "research 10 competitors and write a one-page brief", budget input $5.00 USDC, one gold "Summon a Coven" button, no login, no signup
2. **The Coven at Work:** 5 agent cards — Summoner, Seeker, Weaver, Keeper, Warden — each with a role badge, live status, scoped budget, and amount spent so far. A progress bar for the job, and a Revoke button on a failing agent
3. **The Ledger:** top totals for settled, reserved, unresolved, and approved budget, with the rule settled + reserved + unresolved = approved budget shown in plain text. A list of payments, each row with from agent, to agent, amount, status, and x402 payment hash. Click a row to see the full hash
4. **The Result:** the finished one-page brief, its sources, and the final ledger balanced. A share button and a "Summon another Coven" button

### UX rules

- No login anywhere on the judge path
- Every money number is in USDC, with 2 decimal places, and in integer cents in the code
- Every payment has a status: settled, reserved, unresolved, failed, or revoked
- If a payment is unresolved, say so. Never show it as settled
- Mobile first: the ledger and agent cards stack vertically on a small screen
- Keep the spooky styling in the header, buttons, and badges. Keep the ledger itself plain and readable, because the judge needs to trust the numbers

```
coven/
  .kiro/
    specs/
      coven/
        requirements.md
        design.md
        tasks.md
    steering/
      ledger-rules.md
      money-rules.md
      kiroween-writeup.md
    hooks/
      on-payment.json
      on-test-fail.json
  apps/
    web/            # Next.js, the judge path
    crew/           # Kiro Crew agents
  packages/
    ledger/         # budget reservations, audit log
    payments/       # x402 client and server
    shared/         # types, Zod schemas
  docs/
    judge-path.md
    architecture.md
  tests/
  .env.example
  docker-compose.yml
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  README.md
  LICENSE
  SECURITY.md
```

Do NOT add `.kiro` to `.gitignore`. Kiroween requires `/.kiro` at the root of the public GitHub repo.

## How Kiro was used — the write-up to submit

Write this in the submission, with real examples from the build:

- **Kiro Crew:** which agents you created, what each one does, and how they hand work to each other
- **Specs:** how you structured the spec in `.kiro/specs/coven/`, and how spec-driven development differed from vibe coding
- **Hooks:** which workflows you automated, for example running ledger tests on every payment change, or blocking a commit that breaks the budget invariant
- **Steering:** which steering docs made the biggest difference, for example `money-rules.md` forcing integer accounting and idempotency
- **MCP:** what MCP tools you added, and what they enabled that would have been hard without them
- **Property-based testing:** which ledger requirements you tested with PBT, and what bug it caught that unit tests missed
- **Kiro powers:** which powers you used, and what third-party tooling they brought in

## Judge path — try it in 30 seconds

1. Open the live app
2. Click "Summon a Coven" — no signup, no secret
3. Enter a job: "research 10 competitors and write a one-page brief"
4. Set a budget: $5.00
5. Watch the agents work, pay each other, and fill the ledger
6. Click any payment to see its x402 payment hash, its amount, and its status
7. Check the ledger total: settled + reserved + unresolved = approved budget

That path must work on the live link, with no login and no help from the builder.

## Test plan — target 100+ tests

- Ledger invariant: settled + reserved + unresolved <= approved budget, under concurrent agents
- Idempotency: the same payment request twice settles once
- Atomic reservation: two agents racing for the last dollar cannot both win
- Revocation: a revoked agent cannot spend, and its reserved budget is released
- Reconciliation: an uncertain payment stays unresolved until it is confirmed or released
- x402 flow: a real testnet payment settles and appears in the ledger
- Property-based tests for the ledger, using random job sizes, agent counts, and failure rates

Put the test count in the README, and keep it honest. Do not claim tests that do not run.

## Demo video — under 3 minutes

- 0:00–0:20 — the problem: agents spend without control
- 0:20–1:00 — summon a Coven, set a $5.00 budget, watch the agents work
- 1:00–2:00 — show a real x402 payment, the ledger adding up, and a failed agent being revoked
- 2:00–2:40 — show the repo: `.kiro/specs/`, hooks, steering, and tests
- 2:40–3:00 — the result: the finished brief, and the final ledger

Upload to YouTube, make it public, no copyrighted music.

## What is real vs simplified

Be honest in the README, like the winners do:

- Real: real x402 payments, real atomic reservations in Postgres, real test suite
- Simplified: demo budget is capped, agents run on a test network, and the crew size is limited to 5 agents in the demo

Do not claim mainnet, production, or a live user base unless it is true.

## Build plan — November 19 to December 4

- **Days 1–2 — Spec and skeleton:** write `.kiro/specs/coven/requirements.md`, `design.md`, and `tasks.md`. Set up the pnpm monorepo, Next.js web app, and Postgres. Get one page live.
- **Days 3–5 — Ledger first:** build `packages/ledger` with atomic reservations, idempotency, and reconciliation. Write the property-based tests first. No UI until the ledger invariant holds under concurrency.
- **Days 6–8 — Payments and crew:** add x402 payments, then the 5 Kiro Crew agents. Get one full job working end to end: job in, brief out, ledger balanced.
- **Days 9–11 — Judge path and polish:** make the 30-second judge path work with no login. Add the live demo, the audit view, and the revocation flow. Deploy to Vercel and Railway.
- **Days 12–13 — Proof and video:** run the full test suite, record the demo video, write the README with live link, test count, and payment hash. Write the Kiro write-up.
- **Day 14 — Submit:** submit early on Devpost, then fix only what breaks. Do not start a new feature on the last day.

## Submission checklist

- [ ] Public GitHub repo, with an open source license visible at the top
- [ ] `/.kiro` at the root, not in `.gitignore`
- [ ] Working app URL, with no login needed for the judge path
- [ ] Text description of features and functionality
- [ ] Demo video under 3 minutes, public on YouTube
- [ ] Kiro write-up: Crew, specs, hooks, steering, MCP, PBT, powers
- [ ] Category selected: Frankenstein
- [ ] README with live link, test count, and a real payment hash
- [ ] `.env.example`, no secrets committed
- [ ] Submitted before Friday, December 4, 2026 at 2:00 PM PT

## Why this can win

It follows the pattern from the winners studied on November 19, 2026 — winsznx, Enoch208, and mrnetwork0001:

- One narrow job, with money built in
- A sponsor primitive at the core — here Kiro Crew, plus x402
- A full product, not a frontend demo — web, API, ledger, payments, tests, docs, deploy
- Proof a judge can check in 30 seconds — a real payment, a ledger that adds up, and a test count
- A curated README and a clear judge path, like Clasp, bull-rush, and Inktoll
