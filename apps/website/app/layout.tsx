import "./global.css";
import { RootProvider } from "fumadocs-ui/provider";
import { GeistMono } from "geist/font/mono";
import { Gloria_Hallelujah } from "next/font/google";
import localFont from "next/font/local";
import type { ReactNode } from "react";

const sfProDisplay = localFont({
  src: "../public/fonts/sfprodisplay-medium.otf",
  variable: "--font-sf-pro-display",
});

const ppNeueMontreal = localFont({
  src: [
    {
      path: "../public/fonts/ppneuemontreal-regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/ppneuemontreal-medium.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/ppneuemontreal-italic.otf",
      weight: "500",
      style: "italic",
    },
  ],
  variable: "--font-pp-neue-montreal",
});

const gloriaHallelujah = Gloria_Hallelujah({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-gloria-hallelujah",
});

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${sfProDisplay.variable} ${ppNeueMontreal.variable} ${GeistMono.variable} ${gloriaHallelujah.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col bg-gradient-to-b from-white to-[#FEF7F2]">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
