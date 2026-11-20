import AgentsView from "../../../../components/job/AgentsView";

/** Agents at Work for one job. */
export default async function JobAgentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AgentsView jobId={id} />;
}
