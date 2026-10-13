import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";

import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: { default: "BuildFlow", template: "%s — BuildFlow" },
  description: "Учёт материалов и денег строительной компании",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Д-81: CSP с nonce работает только при рендере на запрос — чтение заголовков делает динамическими
  // все страницы, включая вход (иначе статическая страница уходит без nonce и её скрипты блокируются).
  await headers();
  return (
    <html lang="ru" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
