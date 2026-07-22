import Link from "next/link";
import Hero from "../components/Hero";
import ThemeToggle from "../components/ThemeToggle";

export default function Landing() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-abyss text-chalk">
      {/* The hero is the live map itself, not a screenshot. */}
      <Hero />

      <div className="pointer-events-none relative z-10 flex min-h-dvh flex-col">
        <header className="flex items-center justify-between p-5">
          <span className="font-display text-lg font-bold">Hublands</span>
          <nav className="pointer-events-auto flex gap-4 font-mono text-[12px] text-chalk/70">
            <Link href="/browse" className="hover:text-chalk">browse</Link>
            <Link href="/methods" className="hover:text-chalk">methods</Link>
            <a
              href="https://github.com/sukhleen/hublands"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-chalk"
            >
              source
            </a>
            <ThemeToggle />
          </nav>
        </header>

        <div className="flex flex-1 items-end p-5 pb-14 sm:p-10 sm:pb-20">
          <div className="fade-up ink-shadow relative max-w-xl rounded-lg border-2 border-chalk/40 bg-abyss/85 p-7 backdrop-blur-sm sm:p-9">
            {/* cartouche corner ticks */}
            <span aria-hidden className="absolute -left-px -top-px h-3 w-3 border-l-2 border-t-2 border-chalk/70" />
            <span aria-hidden className="absolute -right-px -top-px h-3 w-3 border-r-2 border-t-2 border-chalk/70" />
            <span aria-hidden className="absolute -bottom-px -left-px h-3 w-3 border-b-2 border-l-2 border-chalk/70" />
            <span aria-hidden className="absolute -bottom-px -right-px h-3 w-3 border-b-2 border-r-2 border-chalk/70" />
            <div className="label-caps text-[10px] text-chalk/55">
              A weekly survey of the open-source model ecosystem
            </div>
            <h1 className="font-display mt-2 text-4xl font-bold leading-tight sm:text-[3.4rem] sm:leading-[1.08]">
              A <em className="font-normal">survey chart</em> of the open model ecosystem.
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-chalk/80">
              Nobody has seen the whole Hugging Face Hub. So I drew it: every
              model and dataset in active use, placed by what it does. Regions
              are neighborhoods of similar work, crowded waters stand out, and
              every place carries a real name.
            </p>
            <div className="mt-6 flex items-center gap-4">
              <Link
                href="/map"
                className="ink-shadow-sm hover:ink-shadow-xs pointer-events-auto rounded-md border-2 border-chalk/70 bg-abyss px-5 py-2.5 font-mono text-[13px] font-medium text-chalk hover:translate-x-[1px] hover:translate-y-[1px]"
              >
                Open the atlas →
              </Link>
              <Link
                href="/browse"
                className="pointer-events-auto font-mono text-[12px] text-chalk/60 underline hover:text-chalk"
              >
                or browse as a list
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
