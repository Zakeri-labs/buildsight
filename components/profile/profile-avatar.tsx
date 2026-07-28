"use client"

import { useEffect, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { profileAvatarDisplayUrl, profileInitials } from "@/lib/profile-avatar"

type ProfileAvatarSize = "xs" | "sm" | "md" | "lg" | "xl"

const sizeClasses: Record<ProfileAvatarSize, string> = {
  xs: "size-6",
  sm: "size-8",
  md: "size-9",
  lg: "size-12",
  xl: "size-20",
}

export function ProfileAvatar({
  name,
  email = "",
  avatarUrl,
  size = "md",
  className,
  fallbackClassName,
}: {
  name: string
  email?: string
  avatarUrl?: string | null
  size?: ProfileAvatarSize
  className?: string
  fallbackClassName?: string
}) {
  const source = profileAvatarDisplayUrl(avatarUrl)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(Boolean(source))

  useEffect(() => {
    setFailed(false)
    setLoading(Boolean(source))
  }, [source])

  return (
    <Avatar className={cn(sizeClasses[size], className)} aria-label={`${name} profile image`}>
      {source && !failed ? (
        <AvatarImage
          src={source}
          alt={name}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false)
            setFailed(true)
          }}
        />
      ) : null}
      <AvatarFallback
        className={cn(
          "bg-primary/10 font-semibold text-primary",
          loading && "animate-pulse text-transparent",
          size === "xs" && "text-[9px]",
          size === "sm" && "text-[10px]",
          size === "md" && "text-xs",
          size === "lg" && "text-sm",
          size === "xl" && "text-xl",
          fallbackClassName,
        )}
      >
        {profileInitials(name, email)}
      </AvatarFallback>
    </Avatar>
  )
}
