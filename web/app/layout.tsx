import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono, IBM_Plex_Sans_Condensed } from "next/font/google";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-fraunces",
});
const plexCond = IBM_Plex_Sans_Condensed({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-plex-cond",
});

export const metadata: Metadata = {
  title: "Hublands, a survey chart of the open model ecosystem",
  description:
    "An interactive atlas of the Hugging Face Hub. Every repo is a point, position is semantic similarity, elevation is usage, and regions carry real names.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  openGraph: {
    title: "Hublands",
    description: "A survey chart of the open model ecosystem.",
    images: ["/api/og"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable} ${plexCond.variable} ${fraunces.variable}`}
    >
      <body className="antialiased">
        {/* apply stored theme before paint to avoid a flash */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var t=new URLSearchParams(location.search).get("theme")||localStorage.getItem("hublands-theme");if(t==="chart")document.documentElement.dataset.theme="chart"}catch(e){}',
          }}
        />
        {children}
      </body>
    </html>
  );
}
