import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "../components/Navbar";
import LineBrowserBanner from "../components/LineBrowserBanner";
import LocalNotificationScheduler from "../components/LocalNotificationScheduler";
import {
  APP_DESCRIPTION,
  APP_NAME,
  APP_SHORT_NAME,
  OGP_DESCRIPTION,
  OGP_IMAGE_HEIGHT,
  OGP_IMAGE_PATH,
  OGP_IMAGE_WIDTH,
} from "../lib/siteMetadata";

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
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");
const ogpImageUrl = `${basePath}${OGP_IMAGE_PATH}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: APP_NAME,
  description: APP_DESCRIPTION,
  manifest: `${basePath}/manifest.webmanifest`,
  openGraph: {
    type: "website",
    locale: "ja_JP",
    title: APP_NAME,
    description: OGP_DESCRIPTION,
    siteName: APP_NAME,
    images: [
      {
        url: ogpImageUrl,
        width: OGP_IMAGE_WIDTH,
        height: OGP_IMAGE_HEIGHT,
        alt: `${APP_NAME}のアイコン`,
      },
    ],
  },
  twitter: {
    card: "summary",
    title: APP_NAME,
    description: OGP_DESCRIPTION,
    images: [ogpImageUrl],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_SHORT_NAME,
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
