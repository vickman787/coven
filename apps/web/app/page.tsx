"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteNav from "./components/SiteNav";

const AGENTS = [
  { blurb: "Takes the job, breaks it into steps, and sets the total budget.", role: "Summoner" },
  { blurb: "Researches the job and gathers real sources.", role: "Seeker" },
  { blurb: "Writes the one-page brief from the sources found.", role: "Weaver" },
  { blurb: "Holds the ledger — reserves budget before any payment.", role: "Keeper" },
  { blurb: "Verifies each step, revokes a failing agent, stops bad payments.", role: "Warden" },
] as const;

/**
 * Landing page ONLY. No summon form lives here — the work happens
 * in the workspace. A judge or a first-time visitor reads what Coven
 * is, then one click takes them to the workspace to summon.
 * Old ?job=<id> deep links still work: they forward to the job's
 * Agents space.
 */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("job");
    if (id) router.replace(`/workspace/jobs/${id}/agents`);
  }, [router]);

  return (
    <>
      <SiteNav />
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-12">
        <p className="text-sm font-semibold tracking-[0.25em] text-[#7c3aed]">
          KIROWEEN 2026 · FRANKENSTEIN
        </p>
        <h1 className="mt-4 text-5xl font-bold leading-tight text-[#f8f7ff]">
          Summon a <span className="text-[#f5c518]">Coven</span>
        </h1>
        <p className="mt-4 text-lg text-[#9a9ab0]">
          A Kiro Crew of AI agents that does a job together. Each agent has a
          scoped budget and pays the next agent per task with x402. Every
          payment is recorded in an audit ledger a judge can verify in 30
          seconds.
        </p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/app"
            className="flex-1 rounded-lg bg-[#f5c518] px-6 py-4 text-center text-lg font-bold text-black hover:brightness-110"
          >
            Launch app
          </Link>
          <Link
            href="/demo"
            className="flex-1 rounded-lg border border-[#7c3aed] px-6 py-4 text-center text-lg font-bold text-[#a78bfa]"
          >
            Try the demo
          </Link>
        </div>
        <p className="mt-3 text-center text-sm text-[#9a9ab0]">
          Sign in with your wallet. No password, no email. Test USDC on
          Base Sepolia.
        </p>

        <section className="mt-16">
          <h2 className="text-2xl font-bold text-[#f8f7ff]">How it works</h2>
          <ol className="mt-6 space-y-4">
            {[
              ["1. Describe the job", "One job, one budget. For example: “research 10 AI note-taking apps and write a one-page brief”."],
              ["2. The Coven does it", "Five specialist agents split the work. Each one has a scoped budget and pays the next agent per task with x402 — real USDC on Base Sepolia testnet."],
              ["3. The ledger proves it", "Every reservation and payment is recorded in PostgreSQL. Settled + reserved + unresolved = approved budget, always. Click any payment to see its onchain hash."],
            ].map(([title, body]) => (
              <li key={title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <p className="font-bold text-[#f8f7ff]">{title}</p>
                <p className="mt-1 text-[#9a9ab0]">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-bold text-[#f8f7ff]">Meet the Coven</h2>
          <p className="mt-2 text-[#9a9ab0]">
            Five Kiro Crew agents. No agent can spend more than its budget,
            and no payment happens twice.
          </p>
          <div className="mt-6 space-y-4">
            {AGENTS.map(({ blurb, role }) => (
              <article key={role} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#7c3aed]">
                  {role}
                </p>
                <p className="mt-1 text-[#9a9ab0]">{blurb}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-bold text-[#f8f7ff]">How the ledger works</h2>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Settled", "Paid onchain, with a hash.", "#22c55e"],
              ["Reserved", "Held for an agent, not yet paid.", "#f59e0b"],
              ["Unresolved", "Outcome unknown — never shown as settled.", "#f59e0b"],
              ["Approved", "The budget you set for the job.", "#f8f7ff"],
            ].map(([label, body, color]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm font-bold" style={{ color }}>{label}</p>
                <p className="mt-1 text-sm text-[#9a9ab0]">{body}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-[#9a9ab0]">
            If an agent fails verification, the Warden revokes it and its
            reserved budget returns to the job.
          </p>
        </section>

        <section className="mt-16 rounded-2xl border border-[#7c3aed]/40 bg-white/[0.03] p-6">
          <h2 className="text-2xl font-bold text-[#f8f7ff]">Honest limits</h2>
          <ul className="mt-4 list-disc space-y-2 pl-6 text-[#9a9ab0]">
            <li>Test USDC on Base Sepolia only — the money has no real value yet.</li>
            <li>One job type for now: a research brief, sourced from Wikipedia. Give the job a topic for a sharp brief.</li>
            <li>Budget $1.00–$10.00, crew of 5 agents.</li>
            <li>Your account is your wallet: sign in with your browser wallet extension, and your jobs and payments follow your address. Demo jobs need no sign-in — they run on the shared demo wallet and are labelled as such.</li>
            <li>Pay from your own wallet with your browser wallet extension, or use the demo wallet. Each job pays your wallet to itself (a self-transfer), so your test USDC is not spent.</li>
          </ul>
          <p className="mt-4 text-sm text-[#9a9ab0]">
            More job types are next — after the Kiroween submission on
            December 4.
          </p>
        </section>

        <footer className="mt-10 text-sm text-[#9a9ab0]">
          Settled + reserved + unresolved = approved budget. Always. ·{" "}
          <Link href="/app" className="text-[#a78bfa] underline">Launch app</Link>
          {" · "}
          <Link href="/demo" className="text-[#a78bfa] underline">Try the demo</Link>
        </footer>
      </main>
    </>
  );
}
