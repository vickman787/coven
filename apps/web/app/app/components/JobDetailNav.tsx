"use client";

import { usePathname } from "next/navigation";
import JobSubNav from "../../components/job/JobSubNav";
import type { JobSpace } from "../../components/job/JobSubNav";

/** Sub-nav between a job's Agents, Ledger and Result spaces, inside the app. */
export default function JobDetailNav({ jobId }: { jobId: string }) {
  const pathname = usePathname();
  const active: JobSpace = pathname.endsWith("/ledger")
    ? "ledger"
    : pathname.endsWith("/result")
      ? "result"
      : "agents";
  return <JobSubNav active={active} base="/app/jobs" jobId={jobId} />;
}
