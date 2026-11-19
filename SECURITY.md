# Security Policy

## Reporting a vulnerability

Do not open a public issue for a security vulnerability. Contact the maintainers privately with a description, steps to reproduce, and the impact.

## Rules for this repo

- Never commit secrets. Use `.env.example` for placeholders only.
- Money is integer cents. Never use floating point for money.
- Payments are idempotent, and budget is reserved atomically before payment.
- An uncertain payment is unresolved, never settled.
- The ledger invariant settled + reserved + unresolved <= approved budget must hold at all times.
