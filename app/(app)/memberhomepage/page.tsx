import { redirect } from "next/navigation"

import { MemberHomepage } from "@/components/member-homepage/member-homepage"
import { requireOnboarded } from "@/lib/auth/session"
import { getMemberHomepageData } from "@/lib/member-homepage/server"

export default async function MemberHomepagePage() {
  const session = await requireOnboarded()
  const primaryMembership = session.memberships[0]

  if (primaryMembership?.role !== "org_member") redirect("/")

  const data = await getMemberHomepageData(session.userId)
  return <MemberHomepage data={data} />
}
