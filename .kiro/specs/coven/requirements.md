# Coven — Requirements

## Overview

Coven is a Kiro Crew of AI agents that does a job together, where each agent has a scoped budget and pays the next agent per task with x402, and every payment is recorded in an audit ledger a judge can verify in 30 seconds.

Kiroween 2026, Frankenstein category. Deadline: Friday, December 4, 2026 at 2:00 PM PT.

## User story

A user posts one job, for example "research 10 competitors and write a one-page brief". Coven breaks the job into steps, assigns each step to a specialist agent, and each agent pays the next agent for its work. The user gets the finished brief. The judge gets proof that the money moved correctly.

## Functional requirements

### R1 — Summon a Coven (Screen 1)

- The home page has a job input, a budget input defaulting to $5.00 USDC, and one gold "Summon a Coven" button.
- No login or signup is required on the judge path.
- The example job is "research 10 competitors and write a one-page brief".

### R2 — The Coven at Work (Screen 2)

- Five agent cards: Summoner, Seeker, Weaver, Keeper, Warden.
- Each card shows a role badge, live status, scoped budget, and amount spent so far.
- The Warden can revoke a failing agent, and its remaining budget returns to the job.

### R3 — The Ledger (Screen 3)

- The ledger shows settled, reserved, unresolved, and approved budget totals.
- The rule settled + reserved + unresolved = approved budget is shown in plain text.
- Each payment row shows from agent, to agent, amount, status, and x402 payment hash. Clicking a row shows the full hash.

### R4 — The Result (Screen 4)

- The finished one-page brief is shown with its sources and the final ledger balanced.
- A "Summon another Coven" button returns to Screen 1.

### R5 — Money rules (must never break)

- Money is accounted in integer cents. No floating point for money.
- Payments are idempotent: the same payment request twice settles once.
- Budget is reserved atomically in PostgreSQL before a payment is authorised.
- The invariant settled + reserved + unresolved <= approved budget holds at all times, including under concurrent agents.
- An uncertain payment is shown as unresolved, never as settled.

### R6 — Kiro usage

- The repo contains `/.kiro` at the root, with specs, hooks, and steering. It is not in `.gitignore`.
- Kiro Crew agents, specs, hooks, steering, MCP, and property-based testing are used and documented in the submission write-up.

## Non-functional requirements

- The judge path works in 30 seconds on the live link, with no login and no help from the builder.
- The app is a pnpm monorepo: TypeScript, Next.js 16, React 19, Tailwind, Hono, Zod, PostgreSQL, x402, USDC.
- Test target: 100+ tests, including property-based tests for the ledger.
- Demo video: under 3 minutes, public on YouTube.
- No secrets are committed. `.env.example` is committed, `.env` is not.
