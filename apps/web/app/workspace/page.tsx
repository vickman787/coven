import { redirect } from "next/navigation";

/** The workspace is now the app — /app is the signed-in product. */
export default function WorkspaceRedirectPage() {
  redirect("/app");
}
