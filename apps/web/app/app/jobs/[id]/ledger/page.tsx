import LedgerView from "../../../../components/job/LedgerView";

/** The Ledger for one of the account's jobs. */
export default async function JobLedgerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LedgerView jobId={id} />;
}
