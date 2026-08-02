export type ReviewSubmissionStatus = "submitted" | "under_review"

export type ReviewSubmissionItem = {
  id: string
  notificationKey: string
  projectId: string
  projectName: string
  stageId: string
  stageName: string
  submittedById: string | null
  submittedBy: string
  submittedAt: string
  status: ReviewSubmissionStatus
  reportNumber: string | null
  reportTitle: string
  href: string
}

export type ReviewSubmissionFeed = { canReview: boolean; items: ReviewSubmissionItem[] }
