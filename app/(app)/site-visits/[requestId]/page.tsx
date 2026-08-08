import { notFound } from "next/navigation"
import { SiteVisitDetail } from "@/components/site-visits/site-visit-detail"
import { requireOnboarded } from "@/lib/auth/session"
import { getSiteVisitRequestDetail } from "@/lib/site-visits/server"

export const dynamic = "force-dynamic"

export default async function SiteVisitRequestPage({ params }: { params: Promise<{ requestId: string }> }) {
  const [{ requestId }, session] = await Promise.all([params, requireOnboarded()])
  const request = await getSiteVisitRequestDetail({
    userId: session.userId,
    requestId,
    memberSupervisorOnly: session.memberships[0]?.role === "org_member",
  })
  if (!request) notFound()
  return <SiteVisitDetail request={request} />
}
