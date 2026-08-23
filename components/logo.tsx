"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { getOrganizationProfile, fetchOrganizationProfileFromDb } from "@/lib/organization/profile"

export function Logo({
  showText = true,
  className,
  textClassName,
  variant = "white",
  forceMode,
}: {
  showText?: boolean
  className?: string
  textClassName?: string
  variant?: "white" | "dark"
  forceMode?: "desktop" | "mobile"
}) {
  const [orgLogoUrl, setOrgLogoUrl] = useState<string | null>(null)
  const [pdfHeaderLogoUrl, setPdfHeaderLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    function updateLogo() {
      const profile = getOrganizationProfile()
      setOrgLogoUrl(profile.logoUrl || null)
      setPdfHeaderLogoUrl(profile.pdfHeaderLogoUrl || null)
    }
    updateLogo()
    fetchOrganizationProfileFromDb().then(updateLogo)

    window.addEventListener("organization_profile_updated", updateLogo)
    return () => {
      window.removeEventListener("organization_profile_updated", updateLogo)
    }
  }, [])

  const defaultLogoSrc = variant === "dark" ? "/LogoB.png" : "/Logow.png"
  const desktopLogoSrc = orgLogoUrl || defaultLogoSrc
  const mobileLogoSrc = pdfHeaderLogoUrl || defaultLogoSrc

  if (forceMode === "desktop") {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <img
          src={desktopLogoSrc}
          alt="Organization Logo"
          className="h-10 w-auto max-w-[190px] object-contain"
        />
      </div>
    )
  }

  if (forceMode === "mobile") {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <img
          src={mobileLogoSrc}
          alt="PDF Header Logo"
          className="h-10 w-auto max-w-[190px] object-contain"
        />
      </div>
    )
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* Desktop Mode (md and above): Organization Logo */}
      <img
        src={desktopLogoSrc}
        alt="Organization Logo"
        className="hidden md:block h-10 w-auto max-w-[190px] object-contain"
      />
      {/* Mobile Mode (below md): PDF Header Logo */}
      <img
        src={mobileLogoSrc}
        alt="PDF Header Logo"
        className="block md:hidden h-10 w-auto max-w-[190px] object-contain"
      />
    </div>
  )
}
