
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
  title: "AGI Research // Command Deck",
  description:
    "AGI Research dashboard, intelligence overview, and agent operations.",
};

export default function RootLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        className="min-h-full flex flex-col"
        style={{
          background: "#050505",
          color: "#f81e36",
        }}
      >
        <div
          className="cosmos"
          aria-hidden="true"
          style={{ opacity: 0.85 }}
        />

        {children}
      </body>
    </html>
  );
}
