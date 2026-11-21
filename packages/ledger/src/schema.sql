CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  approved_budget_cents INTEGER NOT NULL CHECK (approved_budget_cents >= 0),
  status TEXT NOT NULL DEFAULT 'created',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-user wallets (2026-11-20): which wallet signs a job's payments,
-- and which mode it runs in. "demo" = the shared test wallet (or none);
-- "user" = the user's own browser wallet. Added with ALTER so existing
-- databases (including the live Supabase one) migrate on init().
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS payer_address TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS payment_mode TEXT NOT NULL DEFAULT 'demo';

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  agent_role TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'settled', 'released', 'revoked')),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL CHECK (status IN ('settled', 'reserved', 'unresolved', 'failed', 'revoked')),
  idempotency_key TEXT NOT NULL UNIQUE,
  x402_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_revocations (
  job_id TEXT NOT NULL REFERENCES jobs(id),
  agent_role TEXT NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, agent_role)
);

-- The finished brief for a job, written once by the Weaver.
-- sources_json is a JSON string of ResearchSource[] (kept as TEXT so
-- pg-mem and real Postgres behave the same; no JSONB dependency).
CREATE TABLE IF NOT EXISTS job_results (
  job_id TEXT PRIMARY KEY REFERENCES jobs(id),
  brief_markdown TEXT NOT NULL,
  sources_json TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservations_job ON reservations(job_id);
CREATE INDEX IF NOT EXISTS idx_payments_job ON payments(job_id);

-- Wallet-based accounts (2026-11-21): an account is an Ethereum address
-- (stored lowercased). Login is a signed nonce (SIWE-style, no password);
-- sessions are random bearer tokens.
CREATE TABLE IF NOT EXISTS accounts (
  address TEXT PRIMARY KEY,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_nonces (
  address TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (address, nonce)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL REFERENCES accounts(address),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_address ON sessions(address);
CREATE INDEX IF NOT EXISTS idx_auth_nonces_expires ON auth_nonces(expires_at);
