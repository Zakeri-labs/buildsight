export type AppNotificationKind = "review" | "site_visit"

export type AppNotificationItem = {
  id: string
  kind: AppNotificationKind
  notificationKey: string
  title: string
  subject: string
  reference?: string | null
  body: string
  projectName: string
  context: string
  actorId: string | null
  actorName: string
  createdAt: string
  status: string
  href: string
  notifyActor: boolean
}

export type AppNotificationFeed = {
  canNotify: boolean
  items: AppNotificationItem[]
}
