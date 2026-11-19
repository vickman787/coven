# Tests

Target: 100+ tests, including property-based tests for the ledger.

Planned tests (Step 2+):

- Ledger invariant under concurrent agents.
- Idempotency: the same payment request twice settles once.
- Atomic reservation: two agents racing for the last dollar cannot both win.
- Revocation: a revoked agent cannot spend.
- Reconciliation: an uncertain payment stays unresolved.
- x402 flow: a real testnet payment settles and appears in the ledger.

No tests are claimed in Step 1 that do not run.
