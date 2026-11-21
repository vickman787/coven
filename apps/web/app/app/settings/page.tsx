import DisplayNameForm from "../components/DisplayNameForm";
import SignOutButton from "../../components/SignOutButton";
import { getSessionAccount } from "@/lib/auth";
import { shortAddress } from "@/lib/injected-wallet";

/**
 * Settings — minimal and real: display name, account identity,
 * network, and sign-out. Nothing here is a placeholder.
 */
export default async function SettingsPage() {
  const account = await getSessionAccount();
  if (!account) return null; // The app layout redirects when signed out.

  return (
    <>
      <p className="text-sm font-semibold tracking-[0.25em] text-[#7c3aed]">
        COVEN · SETTINGS
      </p>
      <h1 className="mt-4 text-4xl font-bold leading-tight text-[#f8f7ff]">
        <span className="text-[#f5c518]">Settings</span>
      </h1>

      <section className="mt-8 rounded-2xl border border-[#7c3aed]/40 bg-white/[0.03] p-6">
        <h2 className="text-xl font-bold text-[#f8f7ff]">Your account</h2>
        <p className="mt-2 text-sm text-[#9a9ab0]">
          Your account is your wallet — there is no password to change and
          no email on file. The address below is your identity on Coven.
        </p>
        <p className="mt-4 font-mono text-sm text-[#f8f7ff]">{account.address}</p>
        <p className="mt-1 text-sm text-[#9a9ab0]">
          Shown as {account.displayName ?? shortAddress(account.address)}
        </p>
        <DisplayNameForm initialName={account.displayName} />
      </section>

      <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="text-xl font-bold text-[#f8f7ff]">Network</h2>
        <ul className="mt-3 space-y-2 text-sm text-[#9a9ab0]">
          <li>Chain: Base Sepolia (testnet only)</li>
          <li>Payments: x402, exact scheme, USDC, EIP-3009</li>
          <li>Facilitator: x402.org</li>
          <li>Ledger: PostgreSQL audit ledger — settled + reserved + unresolved = approved budget, always</li>
        </ul>
      </section>

      <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="text-xl font-bold text-[#f8f7ff]">Sign out</h2>
        <p className="mt-2 text-sm text-[#9a9ab0]">
          Signing out ends the session on this device and disconnects your
          wallet extension. Your jobs stay in your account — sign in again
          with the same wallet to see them.
        </p>
        <div className="mt-4">
          <SignOutButton />
        </div>
      </section>
    </>
  );
}
