import type { NextConfig } from "next";

// The ledger package reads its SQL schema from packages/ledger/dist/schema.sql
// at runtime. Next.js file tracing does not pick that file up on its own, so
// include it explicitly in every server function that touches the database;
// otherwise /api/jobs fails with ENOENT on Vercel.
const ledgerSchema = [
  "../../packages/ledger/dist/schema.sql",
  "packages/ledger/dist/schema.sql",
];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/": ledgerSchema,
    "/api/jobs": ledgerSchema,
    "/api/jobs/[id]": ledgerSchema,
    "/api/jobs/[id]/revoke": ledgerSchema,
  },
};

export default nextConfig;
