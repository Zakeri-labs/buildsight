import { redirect } from "next/navigation"

import RootDashboardPage from "../page"
import { requireOnboarded } from "@/lib/auth/session"

export default async function MemberDashboardPage() {
  const session = await requireOnboarded()
  const primaryMembership = session.memberships[0]

  if (primaryMembership?.role !== "org_member") {
    redirect("/")
  }

  return <RootDashboardPage />
}
