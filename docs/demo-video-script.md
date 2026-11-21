# Coven — Demo video script (draft, not yet filmed)

Status: draft prepared 2026-11-20 for Step 5. Local file only — not committed
or pushed. Target runtime 2:40–2:55 (limit: under 3:00). Public on YouTube,
no copyrighted music.

Live app: https://coven-mauve.vercel.app/
Repo: https://github.com/vickman787/coven
Deadline: Friday, December 4, 2026, 2:00 PM PT (22:00 UTC / 23:00 WAT).

## Do not film until these three are settled

1. **Extension-wallet test result — still pending (asked 2026-11-20 14:53 UTC).**
   The user was asked to connect their browser extension at
   `/workspace` and run a $5 job, and report connect / sign / settle.
   No answer yet as of 2026-11-20 16:37 UTC. The filmable job depends on
   the answer: if the extension job settles, film that; if it fails,
   fix it first — do not film a failing flow.
2. **Demo topic — verified 2026-11-20 by running the real Seeker
   (`WikipediaProvider` in `apps/crew/src/research.ts`) against live
   Wikipedia.** The old job, "research 10 competitors", names no
   product, so the Seeker returns generic Wikipedia keyword matches
   (Jay Cutler, American Ninja Warrior, …) and the brief on camera
   would look broken. The first recommendation here — "research 10 AI
   note-taking apps …" — was tested and is NOT clean: 10 sources, but
   3 are junk (15.ai, AI slop, and the page for the number "10"),
   because the Seeker's derived queries include "10 ai note-taking"
   and the single-word fallback "10". The citeflowAI alternative is
   worse: "research 10 competitors to citeflowAI …" returns 5 sources,
   all junk ("10", "1", "Scientific notation", "10-10-321", "Pope") —
   citeflowAI has no Wikipedia page, so the search falls back to "10".
   Recommended filmed job:
   **"research note-taking apps and write a one-page brief"** ($5.00) —
   8 sources, all real: Obsidian, Bear, Microsoft OneNote, Comparison
   of note-taking software, Samsung Notes, Note-taking, Cornell Notes,
   Note. Dropping "10" and "AI" from the job text avoids the Seeker's
   poison queries ("10", "ai"). The brief has 8 sources, not 10 — say
   "eight real sources" on camera, not ten. (Root cause: `deriveQueries`
   kept the numeric token and added a single-word fallback query.
   A fix is prepared locally 2026-11-20, not pushed: numeric tokens
   are dropped and the fallback is the first word of 4+ chars, so
   "research 10 AI note-taking apps …" now derives
   ["ai note-taking apps", "note-taking"] with no "10" or "ai" query;
   `research.test.ts` has a regression test, 4 pass, typecheck clean.
   After it is pushed and deployed, a judge typing "research 10 …"
   gets clean sources too — until then, film with the wording above.)
3. **Demo-path payer key — decision needed before filming the judge path.**
   `COVEN_PAYER_PRIVATE_KEY` is still not set in Vercel, so a demo
   (no-wallet) job filmed live would show $0 settled / $5.00 unresolved
   with no hash — the opposite of the video's proof shot. Either set
   the key in the Vercel dashboard before filming (key never goes in
   chat), or film a user-wallet job instead, where the extension signs
   and the payments settle from the user's own wallet. Do not film the
   demo path and present unresolved payments as settled.

## Script — narration + shot, timed

### 0:00–0:20 — The problem (landing page, `/`)
Narration: "AI agents can spend money now — but nobody watches them
spend it. One agent hands a job to the next, and the budget just…
disappears. Coven fixes that: a crew of agents that pays each other
per task, and every payment lands in a ledger you can audit."
Shot: landing page, slow scroll past "what Coven is", the 5 agents,
and how the ledger works. No summon form on this page — say so in one
line if it comes up ("the landing page explains; the work happens in
the workspace").

### 0:20–1:00 — Summon a Coven (`/workspace`)
Narration: "Here's a job: research note-taking apps, and write
a one-page brief. Budget: five dollars, in test USDC on Base Sepolia.
I connect my own wallet — the key never leaves my browser extension —
and summon the Coven."
Shot: `/workspace`, click "Connect browser wallet", approve in the
extension, type the job (input starts empty — do not paste over a
prefilled example; there isn't one any more), $5.00, click
"Summon a Coven". Cut to `/workspace/agents` as the five cards light
up: Summoner, Seeker, Weaver, Keeper, Warden, each with its scoped
budget — $2.00, $2.00, $0.50, $0.50, and the Summoner's allocation.

### 1:00–2:00 — The money: a real payment, a ledger that adds up
Narration: "Watch the money, not just the chat. The Keeper reserves
each handoff before it happens, so the crew can never spend more than
the five dollars. Each payment is a real x402 payment — signed in my
wallet, settled on Base Sepolia — and the ledger has to add up:
settled plus reserved plus unresolved equals the approved budget.
If an agent fails, the Warden revokes it and its budget is released."
Shot: `/workspace/jobs/<id>/ledger` — totals, then click one payment
to show its hash on Blockscout. On-screen proof, job-demo-4
(2026-11-19, settled before filming): Summoner → Seeker $2.00,
`0xa1fa36…bbbd`; Seeker → Weaver $2.00, `0x816d8e…78a2`;
Weaver → Keeper $0.50, `0x25e568…fad1`; Keeper → Warden $0.50,
`0x20d63d…c1df` — $5.00 settled, $0 unresolved. Show the revoke
button on the Agents space; only demonstrate a revoke if a real
failure happens on the filmed run — do not stage one.

### 2:00–2:40 — The repo: Kiro, specs, tests
Narration: "This was built with Kiro, spec-first. The spec lives in
`.kiro/specs/coven/`; steering rules force integer cents and idempotent
payments; a hook runs the ledger tests on every payment change; and
property-based tests caught a real race — two agents both winning the
same budget — before the UI ever existed."
Shot: GitHub repo — `.kiro/` at the root, `specs/`, `steering/`,
`hooks/on-payment.json`, then the test count on screen: **92 tests
pass, 3 skipped** (ledger 25+1, payments 31+2, crew 7, web 29).
Note: the spec target is 100+; the 8-test gap is a Step 5 item, not a
claim to make on camera — say "92 tests" exactly, not "100+".

### 2:40–2:55 — The result
Narration: "The job finishes. One page, eight real sources, and a
ledger that balances to the dollar. That's Coven: agents that work
together — and pay for it, in public."
Shot: `/workspace/jobs/<id>/result` — the finished brief with its
sources, final ledger underneath, share link. End card: live URL,
repo URL, "Kiroween 2026 · Frankenstein".

## Honest limits — say these, do not hide them

- Testnet only: Base Sepolia test USDC, no real value.
- Each payment is a self-transfer in this version (payer = payee), so
  test USDC is not spent — but the onchain settlement is real.
- Demo budget capped at $10.00; crew is 5 agents; one job type
  (research brief via Wikipedia).
- The x402 facilitator is sometimes slow; a payment that fails that
  way stays "unresolved" in the ledger, never shown as settled.
  An agent that finished with an unresolved payment is labelled
  "complete", not "paid" — only settled payments with a hash are "paid".

## Recording order

1. Run the filmed job live first and save its job link + hashes; if it
   does not settle, stop — do not narrate over a broken run.
2. Screen-record the run (agents, ledger, result) in one pass.
3. Record narration over the footage using the script above; keep each
   beat inside its time box and cut, don't rush.
4. Film the repo section last — it does not depend on the live run.

## Submission checklist (from docs/coven-spec.md) — status 2026-11-20

- [x] Public GitHub repo, open-source license at top
  (https://github.com/vickman787/coven, LICENSE present)
- [x] `/.kiro` at root, not in `.gitignore`
- [x] Working app URL, no login for the judge path
  (https://coven-mauve.vercel.app/)
- [ ] Text description of features and functionality (Devpost draft —
  not started)
- [ ] Demo video under 3 minutes, public on YouTube (this script)
- [ ] Kiro write-up (outline only, at `.kiro/steering/kiroween-writeup.md`)
- [x] Category selected: Frankenstein
- [x] README with live link, test count, and a real payment hash —
  header fixed 2026-11-20 (now says live on Vercel; "Not done yet"
  is just the demo video).
- [x] `.env.example`, no secrets committed
- [ ] Submitted before Friday, December 4, 2026 at 2:00 PM PT —
  plan was to submit Dec 2; do not start a new feature on the last day.
