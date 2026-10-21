import type { AppNotificationItem } from "@/lib/notifications/types"

/** Requests still waiting for the team: shown in the bell until read. */
export const NOTIFY_STATUSES = ["new", "confirmed"] as const
export const NOTIFY_WINDOW_DAYS = 30

export type MeetingNotificationRow = {
  id: string
  organization_id: string
  client_name: string
  path: string
  meeting_mode: string
  starts_at: string | null
  status: string
  created_at: string
  designs?: { code: string | null } | null
}

const MODE_LABEL: Record<string, string> = { remote: "Online meeting", office: "Office meeting", call_me: "Call back" }

/** "Sun 25 Oct, 09:00" in the gallery's time zone. */
export function formatMeetingTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso))
}

export function designMeetingNotification(row: MeetingNotificationRow, timeZone: string): AppNotificationItem {
  const mode = MODE_LABEL[row.meeting_mode] ?? row.meeting_mode
  const what = row.path === "idea" ? "Own idea" : `${row.designs?.code ?? "Design"}${row.path === "modified" ? " · with changes" : ""}`
  const when = row.starts_at ? formatMeetingTime(row.starts_at, timeZone) : "Waiting for a call"
  return {
    id: row.id,
    kind: "design_meeting",
    notificationKey: `design_meeting:${row.id}`,
    title: "New Meeting Request",
    subject: row.client_name,
    reference: what,
    body: row.starts_at
      ? `${row.client_name} booked: ${mode}, ${when}.`
      : `${row.client_name} asked to be called back.`,
    projectName: "Design Gallery",
    context: `${mode} · ${when}`,
    actorId: null,
    actorName: row.client_name,
    createdAt: row.created_at,
    status: row.status === "new" ? "New" : "Confirmed",
    href: `/design-gallery/requests?request=${row.id}`,
    notifyActor: false,
  }
}
