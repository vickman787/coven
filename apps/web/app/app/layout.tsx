import { redirect } from "next/navigation";
import AppShell from "./components/AppShell";
import { getSessionAccount } from "@/lib/auth";

/**
 * The app shell is signed-in only: no session, no app. Sign-in
 * lives at /signin; the public demo lives at /demo.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const account = await getSessionAccount();
  if (!account) redirect("/signin");
  return (
    <AppShell address={account.address} displayName={account.displayName}>
      {children}
    </AppShell>
  );
}
