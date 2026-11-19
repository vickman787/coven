# Money rules

- Money is always integer cents in code and in the database. Never use floating point for money.
- Display money in USDC with 2 decimal places, for example $5.00.
- Payments are idempotent: the same payment request, retried, settles once.
- Budget is reserved atomically before payment. Two agents racing for the last dollar cannot both win.
- Reconciliation: an uncertain payment stays unresolved until it is confirmed or released.
- Do not claim a payment settled, a test passed, or a feature works unless it was actually run and observed.
- Do not commit secrets. Use `.env.example` for placeholders only.
