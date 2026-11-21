import Link from "next/link";
import SignInCard from "../components/SignInCard";

/**
 * Sign-in page. The account is the wallet: connect the extension,
 * sign the login message, done. No password, no email.
 */
export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-12">
      <p className="text-sm font-semibold tracking-[0.25em] text-[#7c3aed]">
        COVEN · SIGN IN
      </p>
      <h1 className="mt-4 text-5xl font-bold leading-tight text-[#f8f7ff]">
        Sign in with <span className="text-[#f5c518]">your wallet</span>
      </h1>
      <p className="mt-4 text-lg text-[#9a9ab0]">
        Your wallet address is your Coven account. One signature proves
        you own it — then your jobs, your wallet, and your history are
        yours, on every device you sign in from.
      </p>
      <div className="mt-10">
        <SignInCard />
      </div>
      <p className="mt-8 text-center text-sm text-[#9a9ab0]">
        <Link href="/" className="text-[#a78bfa] underline">
          Back to the landing page
        </Link>
      </p>
    </main>
  );
}
