import "@fontsource-variable/manrope";
import "@fontsource-variable/newsreader";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ConnectivityStatus } from "@/components/connectivity-status";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Zucchero",
  title: "Zucchero — Gestão para confeitarias",
  description: "A rotina da confeitaria, no ritmo de quem faz.",
  icons: {
    icon: "/zucchero-mark.svg",
    apple: "/zucchero-mark.svg",
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f8f3ea",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <ConnectivityStatus />
      </body>
    </html>
  );
}
