# Coven — Design

## Architecture

Monorepo with pnpm workspaces:

- `apps/web` — Next.js 16, React 19, TypeScript, Tailwind. The judge path.
- `apps/crew` — Kiro Crew agents: Summoner, Seeker, Weaver, Keeper, Warden.
- `packages/shared` — shared types and Zod schemas. Money is `amountCents: number` (integer).
- `packages/ledger` — budget reservations and audit log, in PostgreSQL.
- `packages/payments` — x402 client and server. STUB in Step 1, real in a later step.

## Data model (planned, Step 2+)

- `Job { id, description, approvedBudgetCents, status }`
- `Step { id, jobId, agentRole, status, result }`
- `Reservation { id, jobId, agentRole, amountCents, status: reserved | settled | released }`
- `Payment { id, jobId, fromAgent, toAgent, amountCents, status: settled | reserved | unresolved | failed | revoked, x402Hash? }`

## Money flow

1. User approves a job budget.
2. Keeper atomically reserves budget in PostgreSQL before a payment is authorised.
3. An agent does its step, then pays the next agent with x402.
4. The payment settles, or it fails and the reservation is released.
5. If an agent fails verification, the Warden revokes its session and its remaining budget returns to the job.

## UI/UX

- Theme: dark, mystical, Halloween, but clean. Near-black #0B0B14, deep purple #7C3AED, gold #F5C518, pale ghost white #F8F7FF.
- Colours for money states: green #22C55E settled, amber #F59E0B reserved, red #EF4444 failed or revoked, muted grey #9A9AB0 secondary text.
- One clear action per screen, large primary button, cards for agents and payments.
- Mobile first: agent cards and ledger rows stack vertically.
- The ledger itself is plain and readable. Spooky styling lives in the header, buttons, and badges.
- Canva design: https://canva.link/ga12x3grnq660jh

## What is a stub in Step 1

- `packages/payments` returns a stubbed payment result and is marked as a stub in code and README. No real x402 call happens in Step 1.
- `packages/ledger` and `apps/crew` contain types, interfaces, and READMEs only in Step 1. The real ledger is Step 2.
- Screen 1 is live in Step 1. Screens 2, 3, and 4 are planned, not built yet.
