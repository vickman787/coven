"use client";

import { useParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import SiteNav from "../../../components/SiteNav";
import JobSubNav from "../../../components/job/JobSubNav";
import type { JobSpace } from "../../../components/job/JobSubNav";

/**
 * Layout for one job's spaces: the sub-nav between Agents, Ledger
 * and Result lives here, so every job space shares it. The pages
 * themselves are separate routes, not tabs.
 */
export default function JobLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const id = String(params.id);
  const active: JobSpace = pathname.endsWith("/ledger")
    ? "ledger"
    : pathname.endsWith("/result")
      ? "result"
      : "agents";
  return (
    <>
      <SiteNav />
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-12">
        <p className="text-sm font-semibold tracking-[0.25em] text-[#7c3aed]">
          COVEN · JOB {id}
        </p>
        <JobSubNav active={active} jobId={id} />
        {children}
        <footer className="mt-10 text-sm text-[#9a9ab0]">
          Settled + reserved + unresolved = approved budget. Always.
        </footer>
      </main>
    </>
  );
}
