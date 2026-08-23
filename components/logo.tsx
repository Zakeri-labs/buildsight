"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { getOrganizationProfile, fetchOrganizationProfileFromDb } from "@/lib/organization/profile"

export function Logo({
  showText = true,
  className,
  textClassName,
  variant = "white",
}: {
  showText?: boolean
  className?: string
  textClassName?: string
  variant?: "white" | "dark"
}) {
  const [customLogoUrl, setCustomLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    function updateLogo() {
      const profile = getOrganizationProfile()
      setCustomLogoUrl(profile.logoUrl || null)
    }
    updateLogo()
    fetchOrganizationProfileFromDb().then(updateLogo)

    window.addEventListener("organization_profile_updated", updateLogo)
    return () => {
      window.removeEventListener("organization_profile_updated", updateLogo)
    }
  }, [])

  const defaultLogoSrc = variant === "dark" ? "/LogoB.png" : "/Logow.png"
  const logoSrc = customLogoUrl || defaultLogoSrc

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <img
        src={logoSrc}
        alt="Organization Logo"
        className="h-10 w-auto max-w-[190px] object-contain"
      />
    </div>
  )
}

