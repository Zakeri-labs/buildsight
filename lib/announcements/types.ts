export type AnnouncementType = "maintenance" | "update" | "general"

export type SystemAnnouncement = {
  id: string
  message: string
  type: AnnouncementType
  isActive: boolean
  expiresAt: string | null
  createdBy?: string | null
  createdAt?: string
  updatedAt?: string
}

export const DEFAULT_ANNOUNCEMENT: SystemAnnouncement = {
  id: "default",
  message: "",
  type: "maintenance",
  isActive: false,
  expiresAt: null,
}
