import type { Viewport } from "next"

// Public marketing pages: visitors may zoom (the app itself disables it).
export const viewport: Viewport = {
  maximumScale: 5,
  userScalable: true,
}

export default function DesignsLayout({ children }: { children: React.ReactNode }) {
  return children
}
