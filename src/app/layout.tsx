import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "../components/Navbar";
import LineBrowserBanner from "../components/LineBrowserBanner";
import LocalNotificationScheduler from "../components/LocalNotificationScheduler";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#0284c7",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  title: "ノクトのまいにち点眼管理アプリ",
  description: "楽しく目薬の習慣をつけるアプリ",
  manifest: `${basePath}/manifest.webmanifest`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "まいにち点眼",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="h-[100dvh] overflow-hidden flex justify-center bg-gray-100 dark:bg-gray-900">
        <div className="w-full max-w-md bg-background relative flex flex-col h-full shadow-xl overflow-hidden">
          {/* Main Content Area */}
          <main className="flex-1 overflow-y-auto pb-20">
            <LineBrowserBanner />
            {children}
          </main>

          {/* Bottom Navigation Bar */}
          <Navbar />
          <LocalNotificationScheduler />
        </div>
      </body>
    </html>
  );
}
