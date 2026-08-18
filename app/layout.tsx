import { Analytics } from "@vercel/analytics/next"
import type { Metadata, Viewport } from "next"
import { Inter, Geist_Mono } from "next/font/google"
import localFont from "next/font/local"
import { I18nProvider } from "@/lib/i18n"
import { TooltipProvider } from "@/components/ui/tooltip"
import "leaflet/dist/leaflet.css"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })
const gretaArabic = localFont({
  src: [
    {
      path: "../public/fonts/GretaArabic-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/GretaArabic-Bold.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-arabic",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Bonyan — Construction Supervision Platform",
  description:
    "Supervise and manage construction projects: inspections, NCRs, RFIs, variation orders, documents, and progress tracking for consultants, contractors, and owners.",
  generator: "v0.app",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Bonyan",
    startupImage: [
      {
        url: "/app-icons-bonyan/iphone/apple-touch-icon.png",
        media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)",
      },
    ],
  },
  icons: {
    icon: [
      { url: "/app-icons-bonyan/favicon/favicon.ico", type: "image/x-icon" },
      { url: "/app-icons-bonyan/favicon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/app-icons-bonyan/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/app-icons-bonyan/android/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/app-icons-bonyan/android/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/app-icons-bonyan/favicon/favicon.ico",
    apple: [
      { url: "/app-icons-bonyan/iphone/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/app-icons-bonyan/iphone/apple-touch-icon-152.png", sizes: "152x152", type: "image/png" },
      { url: "/app-icons-bonyan/iphone/apple-touch-icon-167.png", sizes: "167x167", type: "image/png" },
    ],
  },
}

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#16273f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" dir="ltr" className={`${inter.variable} ${geistMono.variable} ${gretaArabic.variable} bg-background`}>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Bonyan" />
        <link rel="apple-touch-icon" href="/app-icons-bonyan/iphone/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/app-icons-bonyan/iphone/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/app-icons-bonyan/iphone/apple-touch-icon-152.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/app-icons-bonyan/iphone/apple-touch-icon-167.png" />
        <link rel="icon" type="image/x-icon" href="/app-icons-bonyan/favicon/favicon.ico" />
        <link rel="icon" type="image/png" sizes="16x16" href="/app-icons-bonyan/favicon/favicon-16x16.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/app-icons-bonyan/favicon/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/app-icons-bonyan/pwa/android-chrome-192x192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/app-icons-bonyan/pwa/android-chrome-512x512.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
      </head>
      <body className="font-sans antialiased">
        <I18nProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </I18nProvider>
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
