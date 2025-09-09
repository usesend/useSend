import "@usesend/ui/styles/globals.css";

import { Inter } from "next/font/google";
import { JetBrains_Mono } from "next/font/google";
import type { Metadata } from "next";
import { ThemeProvider } from "@usesend/ui";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "useSend – Open source email platform",
  description: "Pay only for what you send, not for storing contacts",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
  metadataBase: new URL("https://usesend.com"),
  openGraph: {
    title: "useSend – Open source email platform",
    description: "Pay only for what you send, not for storing contacts",
    url: "https://usesend.com",
    siteName: "useSend",
    images: [
      {
        url: "https://uploads.usesend.com/logos/og.png",
        width: 1200,
        height: 630,
        alt: "useSend – Open source email platform",
        type: "image/png",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "useSend – Open source email platform",
    description: "Pay only for what you send, not for storing contacts",
    images: ["https://uploads.usesend.com/logos/og.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "https://usesend.com",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="scroll-smooth bg-background"
    >
      <body
        className={`font-mono ${inter.variable} ${jetbrainsMono.variable} bg-background`}
      >
        {/* System theme with isolated storage to avoid stale overrides */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          storageKey="marketing-theme"
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
