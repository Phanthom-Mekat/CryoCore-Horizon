import type { Metadata, Viewport } from "next";
import { Newsreader, IBM_Plex_Sans, IBM_Plex_Mono, Noto_Sans_Bengali, Noto_Serif_Bengali } from "next/font/google";
import { LANG_BOOT_SCRIPT } from "@/lib/i18n/locale";
import "./globals.css";
import "./theme.css";

const serif = Newsreader({ variable: "--font-serif", subsets: ["latin"], weight: ["400", "500"], style: ["normal"] });
const sans = IBM_Plex_Sans({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500"] });
// Bangla interface (plan F15): only the Bengali subset, so English-only pages never download these
const bnSans = Noto_Sans_Bengali({ variable: "--font-bn-sans", subsets: ["bengali"], weight: ["400", "500", "600"], preload: false });
const bnSerif = Noto_Serif_Bengali({ variable: "--font-bn-serif", subsets: ["bengali"], weight: ["400", "500"], preload: false });

const title = "CryoCore Horizon: Chattogram through the clouds with NISAR radar";
const description =
  "Our NASA Space Apps 2026 project for Dancing with the SARs. We use NASA–ISRO NISAR radar to follow the Bengal delta around Chattogram, Bangladesh, through a monsoon of cloud.";

export const metadata: Metadata = {
  // absolute URLs for the share image: an explicit site URL, else the Vercel production domain, else local dev
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  ),
  title,
  description,
  openGraph: { title, description, type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export const viewport: Viewport = { themeColor: "#ffffff", colorScheme: "light dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning data-scroll-behavior="smooth" className={`${serif.variable} ${sans.variable} ${mono.variable} ${bnSans.variable} ${bnSerif.variable}`}>
      <head>
        {/* Restore an explicit preference before paint; new visitors always start in light mode. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("cryocore-theme")==="dark"?"dark":"light";document.documentElement.dataset.theme=t;document.querySelector('meta[name="theme-color"]')?.setAttribute("content",t==="dark"?"#04080f":"#ffffff")}catch{}` }} />
        {/* the saved interface language, applied before paint like the theme (src/lib/i18n/locale.ts) */}
        <script dangerouslySetInnerHTML={{ __html: LANG_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
