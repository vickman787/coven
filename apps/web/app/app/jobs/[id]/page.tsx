import { redirect } from "next/navigation";

/** /app/jobs/<id> always opens the Agents space. */
export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/app/jobs/${id}/agents`);
}
