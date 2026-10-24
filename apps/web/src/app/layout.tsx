import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { IBM_Plex_Sans_Arabic, Instrument_Sans } from "next/font/google";
import { brand } from "@repo/config";
import { Providers } from "@/components/providers";
import { ThemeScript } from "@/components/theme";
import "./globals.css";

/** UI typeface: Instrument Sans, with IBM Plex Sans Arabic for Arabic text. */
const sans = Instrument_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-instrument",
  display: "swap",
});
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${brand.productName} — ${brand.tagline.replace(/\.$/, "")}`,
    template: `%s · ${brand.productName}`,
  },
  description: brand.description,
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfcfd" },
    { media: "(prefers-color-scheme: dark)", color: "#11161b" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${arabic.variable} ${GeistMono.variable}`}
    >
      <head>
        {/* Applies the saved light/dark theme before first paint. */}
        <ThemeScript />
      </head>
      <body className="min-h-dvh font-sans">
        <a
          href="#main-content"
          className="sr-only z-[100] rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
