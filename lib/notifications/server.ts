import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getReviewSubmissionFeed } from "@/lib/review-submissions/server"
import { getSiteVisitTaskFeed } from "@/lib/site-visits/server"
import { getReportCcNotificationFeed } from "@/lib/report-cc/server"
import type { AppNotificationFeed, AppNotificationItem } from "@/lib/notifications/types"

export async function markNotificationAsRead({
  userId,
  notificationKey,
}: {
  userId: string
  notificationKey: string
}): Promise<boolean> {
  if (!userId || !notificationKey?.trim()) return false
  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from("user_read_notifications")
      .upsert(
        { user_id: userId, notification_key: notificationKey.trim() },
        { onConflict: "user_id,notification_key" },
      )
    if (error) {
      if (error.code === "42P01") return false
      throw error
    }
    return true
  } catch {
    return false
  }
}

export async function getAppNotificationFeed({
  userId,
  organizationId,
  projectId,
}: {
  userId: string
  organizationId: string | null
  projectId: string | null
}): Promise<AppNotificationFeed> {
  const admin = createAdminClient()
  const [reviewResult, siteVisitResult, reportCcResult, readResult] = await Promise.allSettled([
    organizationId
      ? getReviewSubmissionFeed({ userId, organizationId, projectId })
      : Promise.resolve({ canReview: false, items: [] }),
    getSiteVisitTaskFeed({ userId, projectId }),
    getReportCcNotificationFeed({ userId, projectId }),
    admin.from("user_read_notifications").select("notification_key").eq("user_id", userId),
  ])
  const reviewFeed = reviewResult.status === "fulfilled" ? reviewResult.value : { canReview: false, items: [] }
  const siteVisitFeed = siteVisitResult.status === "fulfilled" ? siteVisitResult.value : { canManage: false, items: [] }
  const reportCcFeed = reportCcResult.status === "fulfilled" ? reportCcResult.value : { canNotify: false, items: [] }

  const readKeys = new Set<string>()
  if (readResult.status === "fulfilled" && !readResult.value.error && readResult.value.data) {
    for (const row of readResult.value.data as any[]) {
      if (typeof row.notification_key === "string") readKeys.add(row.notification_key)
    }
  }

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

  const reportCcItems: AppNotificationItem[] = reportCcFeed.items.map((item) => ({
    id: item.id,
    kind: "report_cc",
    notificationKey: item.notificationKey,
    title: item.context === "translation" ? "Translation CC" : "Report Created",
    subject: item.reportTitle,
    reference: item.reportNumber,
    body: item.context === "translation"
      ? `You have been CC'd on a report translation in ${item.projectName}.`
      : `You have been CC'd on a report in ${item.projectName}.`,
    projectName: item.projectName,
    context: `${item.stageName} · ${item.termName}`,
    actorId: item.addedById,
    actorName: item.addedByName,
    createdAt: item.createdAt,
    status: "CC Recipient",
    href: item.href,
    notifyActor: false,
  }))

  const items = [...reportCcItems, ...reviewItems, ...siteVisitItems]
    .filter((item) => !readKeys.has(item.notificationKey))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))

  return { canNotify: reportCcFeed.canNotify || reviewFeed.canReview || siteVisitFeed.canManage, items }
}

