import ResultView from "../../../../components/job/ResultView";

/** The Result for one job. */
export default async function JobResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ResultView jobId={id} />;
}
