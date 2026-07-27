import { Analytics } from "@vercel/analytics/next"
import type { Metadata, Viewport } from "next"
import { Inter, Geist_Mono, Vazirmatn } from "next/font/google"
import { I18nProvider } from "@/lib/i18n"
import { TooltipProvider } from "@/components/ui/tooltip"
import "leaflet/dist/leaflet.css"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })
const vazirmatn = Vazirmatn({ subsets: ["arabic"], variable: "--font-arabic", weight: ["300", "400", "500", "600", "700", "800"] })

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
    <html lang="en" dir="ltr" className={`${inter.variable} ${geistMono.variable} ${vazirmatn.variable} bg-background`}>
      <body className="font-sans antialiased">
        <I18nProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </I18nProvider>
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
