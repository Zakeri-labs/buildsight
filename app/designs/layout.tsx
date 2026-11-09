import type { Viewport } from "next"

// Public marketing pages: visitors may zoom (the app itself disables it).
export const viewport: Viewport = {
  maximumScale: 5,
  userScalable: true,
}

export default function DesignsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap"
      />
      {children}
    </>
  )
}
