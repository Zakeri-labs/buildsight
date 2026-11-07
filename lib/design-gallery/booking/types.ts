export const MEETING_PATHS = ["same", "modified", "idea"] as const
export type MeetingPath = (typeof MEETING_PATHS)[number]

export const PROJECT_TYPES = ["villa", "residential_complex", "commercial", "other"] as const
export type ProjectType = (typeof PROJECT_TYPES)[number]

export const LAND_STATUSES = ["owned_ready", "purchasing", "no_land"] as const
export type LandStatus = (typeof LAND_STATUSES)[number]

export const START_TIMELINES = ["within_3_months", "within_year", "exploring"] as const
export type StartTimeline = (typeof START_TIMELINES)[number]

export const MEETING_MODES = ["remote", "office", "call_me"] as const
export type MeetingMode = (typeof MEETING_MODES)[number]

export const MEETING_STATUSES = ["new", "confirmed", "attended", "quote", "contract", "no_show", "cancelled"] as const
export type MeetingStatus = (typeof MEETING_STATUSES)[number]

export const IDEA_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const
export const IDEA_FILE_MAX_BYTES = 10 * 1024 * 1024
export const IDEA_FILE_MAX_COUNT = 3

/** A booking or "call me" request after validation. */
export type MeetingRequestInput = {
  requestKey: string
  path: MeetingPath
  designSlug: string | null
  clientName: string
  whatsappPhone: string
  email: string | null
  projectType: ProjectType
  landStatus: LandStatus
  /** Key from the wilayat list, or free text after "other:". */
  wilayat: string | null
  landAreaSqm: number | null
  startTimeline: StartTimeline
  ideaText: string | null
  meetingMode: MeetingMode
  slotStart: string | null
  attachmentPaths: string[]
  locale: "ar" | "en"
}
