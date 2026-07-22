import type { Metadata } from "next";
import Link from "next/link";
import MethodsStats from "../../components/MethodsStats";
import ThemeToggle from "../../components/ThemeToggle";

export const metadata: Metadata = {
  title: "Methods · Hublands",
  description: "How the atlas is built: sources, thresholds, models, and refresh cadence.",
};

export default function MethodsPage() {
  return (
    <main className="min-h-dvh bg-abyss text-chalk">
      <header className="flex items-center justify-between border-b hairline px-5 py-4">
        <Link href="/" className="font-display text-[17px] font-bold">
          Hublands
        </Link>
        <nav className="flex items-center gap-3 font-mono text-[12px] text-chalk/70">
          <Link href="/map" className="hover:text-chalk">map</Link>
          <Link href="/browse" className="hover:text-chalk">browse</Link>
          <span aria-current="page" className="text-chalk">methods</span>
          <ThemeToggle />
        </nav>
      </header>

      <article className="mx-auto max-w-2xl px-5 py-10 leading-relaxed">
        <h1 className="text-3xl font-semibold">How this map is made</h1>
        <p className="mt-3 text-chalk/80">
          Everything below is reproducible from the{" "}
          <a
            href="https://github.com/sukhleen/hublands"
            className="text-chalk/75 underline underline-offset-2 hover:text-chalk"
            target="_blank"
            rel="noopener noreferrer"
          >
            pipeline code
          </a>
          . There is no server: every artifact is precomputed offline and served
          as a static file.
        </p>

        <div className="mt-6">
          <MethodsStats />
        </div>

        <Section title="Sources">
          <p>
            Metadata (downloads, likes, tags, dates) comes from the public
            Hugging Face Hub API. Card text comes from the{" "}
            <Ext href="https://huggingface.co/datasets/librarian-bots/model_cards_with_metadata">
              librarian-bots card datasets
            </Ext>
            , rebuilt daily by the Hub&apos;s ML Librarian, with a raw-README
            fallback. Nothing is scraped, and no weights or data files are
            rehosted. Card summaries are truncated to about 400 characters with
            emails and bare links stripped.
          </p>
        </Section>

        <Section title="What is included">
          <p>
            The inhabited Hub, not all of it. A model qualifies with at least
            200 downloads in the last month or 5 likes; a dataset with 100
            downloads or 5 likes; plus the top 2,000 trending repos. The long
            tail of near-duplicate quantizations and abandoned fine-tunes is
            excluded from v1; an opt-in long-tail layer is on the roadmap.
            Exact thresholds live in the pipeline and are tuned to keep the
            corpus between 120k and 200k points.
          </p>
        </Section>

        <Section title="Placement">
          <p>
            Each repo becomes one document: its id, task, library, license,
            tags, and the first 1,500 characters of its cleaned card. Documents
            are embedded with{" "}
            <code className="font-mono text-[13px]">sentence-transformers/all-MiniLM-L6-v2</code>{" "}
            (384 dims), reduced with PCA to 50 dims, then projected to 2D with
            UMAP (n_neighbors 15, min_dist 0.05, cosine). Nearby points mean
            similar descriptions. Distance is meaningful locally, not globally.
          </p>
        </Section>

        <Section title="The map never moves">
          <p>
            The projection was fitted once and is frozen. Weekly refreshes
            place new repos into the existing layout with{" "}
            <code className="font-mono text-[13px]">umap.transform()</code> and
            never refit, so links and screenshots stay valid. New repos that
            land far from every known cluster are marked Unmapped. If Unmapped
            ever exceeds 5% of the corpus, a v2 map will be cut and announced,
            with v1 kept alive for six months.
          </p>
        </Section>

        <Section title="Regions and names">
          <p>
            Clusters come from HDBSCAN at three granularities on the 50-dim
            vectors. Names start as c-TF-IDF terms over member documents and
            are curated by hand in a committed labels file. Density is a
            downloads-weighted kernel density estimate; contours are its
            isolines. Elevation is usage, nothing more.
          </p>
        </Section>

        <Section title="Search">
          <p>
            Name search is a raw byte scan over the id blob in a worker, no
            index file. Semantic search is opt-in: your browser downloads the
            same MiniLM weights (via transformers.js) plus 64-dim quantized
            vectors, and every query is embedded and ranked on your machine.
            Nothing you type leaves the page.
          </p>
        </Section>

        <Section title="Cadence and cost">
          <p>
            A GitHub Actions job refreshes the data weekly. The app is static
            hosting; the data lives on a Hugging Face dataset repo; total
            running cost is zero. Analytics are cookieless page counts.
          </p>
        </Section>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="label-caps text-[12px] font-semibold text-chalk/70">{title}</h2>
      <div className="mt-2 text-[14.5px] text-chalk/85">{children}</div>
    </section>
  );
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-chalk/75 underline underline-offset-2 hover:text-chalk">
      {children}
    </a>
  );
}
