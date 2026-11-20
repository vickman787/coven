"use client";

import Link from "next/link";

export type JobSpace = "agents" | "ledger" | "result";

const SPACES: [JobSpace, string][] = [
  ["agents", "Agents at Work"],
  ["ledger", "The Ledger"],
  ["result", "The Result"],
];

/** Navigation between a job's three spaces. Not tabs on one page — separate routes. */
export default function JobSubNav({
  active,
  jobId,
}: {
  active: JobSpace;
  jobId: string;
}) {
  return (
    <nav className="mt-8 flex flex-wrap gap-2">
      {SPACES.map(([key, label]) => {
        const href = `/workspace/jobs/${jobId}/${key}`;
        return active === key ? (
          <span
            key={key}
            className="rounded-full border border-[#f5c518] bg-[#f5c518] px-4 py-2 text-sm font-semibold text-black"
          >
            {label}
          </span>
        ) : (
          <Link
            key={key}
            href={href}
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-[#f8f7ff] hover:border-[#7c3aed]"
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
