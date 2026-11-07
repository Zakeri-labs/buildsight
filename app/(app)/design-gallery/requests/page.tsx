import { MeetingRequests } from "@/components/design-gallery/meeting-requests"
import { loadMeetingRequests } from "@/lib/design-gallery/booking/admin"
import { getDesignGalleryAdmin, loadSite } from "@/lib/design-gallery/server"
import { DesignGalleryAdminOnly } from "../admin-only"

export const dynamic = "force-dynamic"

export default async function MeetingRequestsPage({ searchParams }: { searchParams: Promise<{ request?: string | string[] }> }) {
  const ctx = await getDesignGalleryAdmin()
  if (!ctx) return <DesignGalleryAdminOnly />
  const [requests, site, params] = await Promise.all([loadMeetingRequests(ctx), loadSite(ctx.admin, ctx.org.id), searchParams])
  const highlight = Array.isArray(params.request) ? params.request[0] : params.request
  return <MeetingRequests requests={requests} timeZone={site?.booking.timeZone ?? "Asia/Muscat"} highlightId={highlight ?? null} />
}
