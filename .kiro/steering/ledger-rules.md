# Ledger rules

- The ledger is the source of truth for money in Coven.
- Every job has an approved budget in integer cents.
- At all times: settled + reserved + unresolved <= approved budget.
- A reservation is made atomically in PostgreSQL before a payment is authorised.
- A payment that fails releases its reservation.
- A payment whose outcome is unknown stays unresolved. Never show it as settled.
- A revoked agent cannot spend. Its reserved budget is released back to the job.
- Every ledger entry records job id, from agent, to agent, amount in cents, status, and, when settled, the x402 payment hash.
- The ledger is plain and readable in the UI. The judge must be able to check the total in 30 seconds.
