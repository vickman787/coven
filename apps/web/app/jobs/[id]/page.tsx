import { redirect } from "next/navigation";

/**
 * Old shareable job URL — a job's spaces now live under
 * /workspace/jobs/<id>/…, opening on Agents at Work.
 */
export default async function JobRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/workspace/jobs/${id}/agents`);
}
