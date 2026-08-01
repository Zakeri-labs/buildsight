import "server-only"

import { getReviewSubmissionFeed } from "@/lib/review-submissions/server"
import { getSiteVisitTaskFeed } from "@/lib/site-visits/server"
import type { AppNotificationFeed, AppNotificationItem } from "@/lib/notifications/types"

export async function getAppNotificationFeed({
  userId,
  organizationId,
  projectId,
}: {
  userId: string
  organizationId: string | null
  projectId: string | null
}): Promise<AppNotificationFeed> {
  const [reviewResult, siteVisitResult] = await Promise.allSettled([
    organizationId
      ? getReviewSubmissionFeed({ userId, organizationId, projectId })
      : Promise.resolve({ canReview: false, items: [] }),
    getSiteVisitTaskFeed({ userId, projectId }),
  ])
  const reviewFeed = reviewResult.status === "fulfilled" ? reviewResult.value : { canReview: false, items: [] }
  const siteVisitFeed = siteVisitResult.status === "fulfilled" ? siteVisitResult.value : { canManage: false, items: [] }

  const reviewItems: AppNotificationItem[] = reviewFeed.items.map((item) => ({
    id: item.id,
    kind: "review",
    notificationKey: item.notificationKey,
    title: "New Review Submission",
    subject: item.reportTitle,
    reference: item.reportNumber,
    body: `${item.reportTitle}${item.reportNumber ? ` (${item.reportNumber})` : ""} was submitted for review in ${item.projectName}.`,
    projectName: item.projectName,
    context: `${item.stageName} · ${item.subtermName ?? item.parentTermName}`,
    actorId: item.submittedById,
    actorName: item.submittedBy,
    createdAt: item.submittedAt,
    status: item.status === "under_review" ? "Under Review" : "Submitted",
    href: item.href,
    notifyActor: false,
  }))

  const siteVisitItems: AppNotificationItem[] = siteVisitFeed.items.map((item) => ({
    id: item.id,
    kind: "site_visit",
    notificationKey: item.notificationKey,
    title: "New Site Visit Request",
    subject: "Site Visit Request",
    body: `${item.projectName} site visit requested by ${item.requestedBy}.`,
    projectName: item.projectName,
    context: item.preferredVisit,
    actorId: item.requestedById,
    actorName: item.requestedBy,
    createdAt: item.createdAt,
    status: "Pending",
    href: item.href,
    notifyActor: false,
  }))

  const items = [...reviewItems, ...siteVisitItems].sort(
    (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
  )
  return { canNotify: reviewFeed.canReview || siteVisitFeed.canManage, items }
}
