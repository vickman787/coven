import { redirect } from "next/navigation";

/** Agents at Work now lives on the Jobs page, filtered to running jobs. */
export default function AgentsRedirectPage() {
  redirect("/app/jobs?status=running");
}
