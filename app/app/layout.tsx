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
  title: "Provision Consultancy — Construction Supervision Platform",
  description:
    "Supervise and manage construction projects: inspections, NCRs, RFIs, variation orders, documents, and progress tracking for consultants, contractors, and owners.",
  generator: "v0.app",
}

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#16273f",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" dir="ltr" className={`${inter.variable} ${geistMono.variable} ${gretaArabic.variable} bg-background`}>
      <body className="font-sans antialiased">
        <I18nProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </I18nProvider>
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
