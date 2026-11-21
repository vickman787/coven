import { notFound } from "next/navigation";
import JobDetailNav from "../../components/JobDetailNav";
import { getLedger } from "@/lib/coven";
import { getSessionAccount } from "@/lib/auth";

/**
 * Layout for one of the account's jobs. Server-guarded: a user
 * job only opens for the account whose wallet paid for it; anyone
 * else gets a 404. Demo jobs are public and open in the public
 * job viewer instead (/workspace/jobs/<id>/…).
 */
export default async function JobLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const account = await getSessionAccount();
  if (!account) notFound();
  const ledger = await getLedger();
  const job = await ledger.getJob(id);
  if (
    !job ||
    (job.paymentMode === "user" &&
      job.payerAddress?.toLowerCase() !== account.address.toLowerCase())
  ) {
    notFound();
  }
  return (
    <>
      <p className="text-sm font-semibold tracking-[0.25em] text-[#7c3aed]">
        COVEN · JOB {id}
      </p>
      <JobDetailNav jobId={id} />
      {children}
      <footer className="mt-10 text-sm text-[#9a9ab0]">
        Settled + reserved + unresolved = approved budget. Always.
      </footer>
    </>
  );
}
