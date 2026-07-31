export type ReviewSubmissionStatus = "submitted" | "under_review"

export type ReviewSubmissionItem = {
  id: string
  notificationKey: string
  projectId: string
  projectName: string
  stageId: string
  stageName: string
  termId: string
  parentTermName: string
  subtermName: string | null
  submittedById: string | null
  submittedBy: string
  submittedAt: string
  status: ReviewSubmissionStatus
  reportNumber: string | null
  href: string
}

export type ReviewSubmissionFeed = {
  canReview: boolean
  items: ReviewSubmissionItem[]
}
