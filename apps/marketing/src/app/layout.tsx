import "./globals.css";

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
  title: "OTP-AUTH — Build your email delivery layer",
  description:
    "OTP authentication, transactional email and developer-controlled sender identities through one developer-first platform.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
  openGraph: {
    title: "OTP-AUTH — Build your email delivery layer",
    description:
      "OTP authentication, transactional email and developer-controlled sender identities through one developer-first platform.",
    siteName: "OTP-AUTH",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "OTP-AUTH — Build your email delivery layer",
    description:
      "OTP authentication, transactional email and developer-controlled sender identities through one developer-first platform.",
  },
  robots: {
    index: true,
    follow: true,
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
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          storageKey="otp-auth-marketing-theme"
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
