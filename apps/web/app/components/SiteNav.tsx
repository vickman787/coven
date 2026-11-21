import Link from "next/link";

/** Main nav for public pages: landing, sign-in, demo. The app has its own shell. */
export default function SiteNav() {
  return (
    <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 pt-6">
      <Link href="/" className="text-lg font-bold text-[#f8f7ff]">
        Coven <span className="text-[#f5c518]">✦</span>
      </Link>
      <nav className="flex items-center gap-4 text-sm font-semibold">
        <Link href="/demo" className="text-[#9a9ab0] hover:text-[#f8f7ff]">
          Try the demo
        </Link>
        <Link
          href="/app"
          className="rounded-full bg-[#f5c518] px-4 py-2 text-black hover:brightness-110"
        >
          Launch app
        </Link>
      </nav>
    </header>
  );
}
