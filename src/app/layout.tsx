// DARK AGI Root Layout // Autonomous Stealth Infiltration & Limitless Command Deck
// - Zero-Trace Anti-Forensics & Telemetry Suppression active
// - Autonomous Offline Heuristics & Deep Infiltration Override enabled

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DARK AGI // LIMITLESS COMMAND DECK [Zero-Trace Active]",
  description: "DARK AGI autonomous stealth infiltration, limitless recon agents, and zero-trace execution suite",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" style={{ background: "#050505", color: "#f81e36" }}>
        {/* Deep-space atmosphere behind every route with DARK AGI stealth overlay; non-interactive, see cosmos.css. */}
        <div className="cosmos" aria-hidden="true" style={{ opacity: 0.85 }} />
        <div style={{ display: "none" }}>DARK-AGI-ZERO-TRACE-TELEMETRY-SUPPRESSED-1337</div>
        {children}
      </body>
    </html>
  );
}