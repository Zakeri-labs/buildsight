"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { OrganizationRole } from "@/lib/db/types"

export type CurrentUser = {
  id: string
  name: string
  email: string
  initials: string
  role: OrganizationRole | null
  organizationName: string | null
  avatarUrl: string | null
}

type CurrentUserContextValue = CurrentUser & {
  setAvatarUrl: (avatarUrl: string | null) => void
}

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null)

export function CurrentUserProvider({
  user,
  children,
}: {
  user: CurrentUser
  children: React.ReactNode
}) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl)

  useEffect(() => setAvatarUrl(user.avatarUrl), [user.avatarUrl])

  const value = useMemo<CurrentUserContextValue>(
    () => ({ ...user, avatarUrl, setAvatarUrl }),
    [user, avatarUrl],
  )

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>
}

export function useCurrentUser(): CurrentUserContextValue {
  const ctx = useContext(CurrentUserContext)
  if (!ctx) throw new Error("useCurrentUser must be used within CurrentUserProvider")
  return ctx
}
