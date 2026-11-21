import AgentsView from "../../../../components/job/AgentsView";

/** Agents at Work for one of the account's jobs. */
export default async function JobAgentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AgentsView base="/app/jobs" jobId={id} />;
}
