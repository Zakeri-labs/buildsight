import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getReviewSubmissionFeed } from "@/lib/review-submissions/server"
import { getSiteVisitTaskFeed } from "@/lib/site-visits/server"
import { getReportCcNotificationFeed } from "@/lib/report-cc/server"
import type { TaskRow } from "@/lib/db/domain"

export async function getMyTasksPageData({
  userId,
  organizationId,
  projectId,
  userRole,
}: {
  userId: string
  organizationId: string | null
  projectId: string | null
  userRole?: string | null
}): Promise<{ tasks: TaskRow[] }> {
  const [reviewResult, siteVisitResult, reportCcResult] = await Promise.allSettled([
    organizationId
      ? getReviewSubmissionFeed({ userId, organizationId, projectId, userRole })
      : Promise.resolve({ canReview: false, items: [] }),
    getSiteVisitTaskFeed({ userId, projectId, userRole }),
    getReportCcNotificationFeed({ userId, projectId }),
  ])

  const reviewFeed = reviewResult.status === "fulfilled" ? reviewResult.value : { canReview: false, items: [] }
  const siteVisitFeed = siteVisitResult.status === "fulfilled" ? siteVisitResult.value : { canManage: false, items: [] }
  const reportCcFeed = reportCcResult.status === "fulfilled" ? reportCcResult.value : { canNotify: false, items: [] }

  const reviewTasks: TaskRow[] = reviewFeed.items.map((item) => ({
    id: `review:${item.id}`,
    action: "Review Submission",
    type: "Review",
    reference: item.reportNumber,
    reportTitle: item.reportTitle,
    dueLabel: item.status === "under_review" ? "Under Review" : "Submitted",
    dueTone: item.status === "under_review" ? "warning" : "danger",
    projectName: item.projectName,
    href: item.href,
    stageName: item.stageName,
    parentTermName: item.parentTermName,
    subtermName: item.subtermName,
    submittedBy: item.submittedBy,
    submittedAt: item.submittedAt,
    reviewStatus: item.status,
  }))

  const siteVisitTasks: TaskRow[] = siteVisitFeed.items.map((item) => ({
    id: `site-visit:${item.id}`,
    action: "New Site Visit Request",
    type: "Site Visit",
    reference: null,
    dueLabel: "Pending",
    dueTone: "warning",
    projectName: item.projectName,
    href: item.href,
    requestedBy: item.requestedBy,
    preferredVisit: item.preferredVisit,
    siteVisitStatus: item.status,
    submittedAt: item.createdAt,
  }))

  const reportCcTasks: TaskRow[] = reportCcFeed.items.map((item) => ({
    id: `report-cc:${item.id}`,
    action: "Report CC Notification",
    type: "CC",
    reference: item.reportNumber,
    reportTitle: item.reportTitle,
    dueLabel: "CC Copy",
    dueTone: "muted",
    projectName: item.projectName,
    href: item.href,
    stageName: item.stageName,
    parentTermName: item.termName,
    submittedAt: item.createdAt,
    ccContext: item.context,
    ccAddedBy: item.addedByName,
  }))

  let standardTasks: TaskRow[] = []
  try {
    const admin = createAdminClient()
    let query = admin.from("tasks").select("id, project_id, action, type, reference, due_label, due_tone, sort_order, projects(name)")
    if (projectId) {
      query = query.eq("project_id", projectId)
    }
    const { data, error } = await query.order("sort_order", { ascending: true })
    if (!error && Array.isArray(data)) {
      standardTasks = data.map((t: any) => ({
        id: t.id,
        action: t.action,
        type: t.type,
        reference: t.reference,
        dueLabel: t.due_label,
        dueTone: t.due_tone,
        projectName: t.projects?.name ?? "Unknown",
      }))
    }
  } catch {
    // Graceful fallback if tasks table is absent or schema mismatch
  }

  const taskRows: TaskRow[] = [
    ...reviewTasks,
    ...siteVisitTasks,
    ...reportCcTasks,
    ...standardTasks,
  ]

  taskRows.sort((a, b) => {
    const timeA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0
    const timeB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0
    if (timeB !== timeA) {
      return timeB - timeA
    }
    return b.id.localeCompare(a.id)
  })

  return { tasks: taskRows }
}
