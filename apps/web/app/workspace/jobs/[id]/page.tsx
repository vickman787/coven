import { redirect } from "next/navigation";

/** /workspace/jobs/<id> always opens the Agents space. */
export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/workspace/jobs/${id}/agents`);
}
