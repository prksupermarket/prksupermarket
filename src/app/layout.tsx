import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Supplier Payments",
  description: "Easy and safe supplier payment tracker for R K Supermarket",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // Prevents zooming to keep UI stable for elderly users
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-50 text-slate-900 min-h-screen pb-16`}>
        <header className="bg-slate-900 text-white p-6 shadow-md mb-6">
          <h1 className="text-3xl font-bold text-center tracking-tight">R K Supermarket</h1>
          <p className="text-center text-slate-300 mt-2 text-xl font-medium">Supplier Payments</p>
        </header>
        <main className="max-w-md mx-auto px-4">
          {children}
        </main>
      </body>
    </html>
  );
}
