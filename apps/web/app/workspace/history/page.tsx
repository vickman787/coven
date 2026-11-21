import { redirect } from "next/navigation";

/** Work history is now the app's Jobs page. */
export default function HistoryRedirectPage() {
  redirect("/app/jobs");
}
