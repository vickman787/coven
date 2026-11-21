import { redirect } from "next/navigation";

/** Old history URL — jobs now live in the app. */
export default function JobsRedirectPage() {
  redirect("/app/jobs");
}
