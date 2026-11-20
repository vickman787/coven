import { redirect } from "next/navigation";

/** Old history URL — history now lives in the workspace. */
export default function JobsRedirectPage() {
  redirect("/workspace/history");
}
