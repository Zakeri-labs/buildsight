"use client"

import { createContext, useContext } from "react"
import type { OrganizationRole } from "@/lib/db/types"

export type CurrentUser = {
  id: string
  name: string
  email: string
  initials: string
  role: OrganizationRole | null
  organizationName: string | null
}

const CurrentUserContext = createContext<CurrentUser | null>(null)

export function CurrentUserProvider({
  user,
  children,
}: {
  user: CurrentUser
  children: React.ReactNode
}) {
  return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>
}

export function useCurrentUser(): CurrentUser {
  const ctx = useContext(CurrentUserContext)
  if (!ctx) throw new Error("useCurrentUser must be used within CurrentUserProvider")
  return ctx
}
