import { expect, test, vi } from "vitest"

let readKeys: string[] = []
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: async () => ({ data: readKeys.map((notification_key) => ({ notification_key })), error: null }) }) }),
  }),
}))
vi.mock("@/lib/review-submissions/server", () => ({ getReviewSubmissionFeed: async () => ({ canReview: false, items: [] }) }))
vi.mock("@/lib/site-visits/server", () => ({ getSiteVisitTaskFeed: async () => ({ canManage: false, items: [] }) }))
vi.mock("@/lib/report-cc/server", () => ({ getReportCcNotificationFeed: async () => ({ canNotify: false, items: [] }) }))
const meetingFeed = vi.fn()
vi.mock("@/lib/design-gallery/booking/admin", () => ({ getDesignMeetingNotificationFeed: (args: unknown) => meetingFeed(args) }))

const { getAppNotificationFeed } = await import("./server")

const item = (id: string, createdAt: string) => ({
  id,
  kind: "design_meeting" as const,
  notificationKey: `design_meeting:${id}`,
  title: "New Meeting Request",
  subject: "أحمد",
  body: "",
  projectName: "Design Gallery",
  context: "",
  actorId: null,
  actorName: "أحمد",
  createdAt,
  status: "New",
  href: `/design-gallery/requests?request=${id}`,
  notifyActor: false,
})

test("meeting requests appear in the bell, newest first; read ones are hidden", async () => {
  meetingFeed.mockResolvedValue({ canNotify: true, items: [item("a", "2026-10-21T10:00:00Z"), item("b", "2026-10-21T11:00:00Z")] })
  readKeys = ["design_meeting:a"]
  const feed = await getAppNotificationFeed({ userId: "u1", organizationId: "org", projectId: null })
  expect(meetingFeed).toHaveBeenCalledWith({ userId: "u1" })
  expect(feed.canNotify).toBe(true)
  expect(feed.items.map((i) => i.notificationKey)).toEqual(["design_meeting:b"])
})

test("a failing meeting feed does not break the other notifications", async () => {
  meetingFeed.mockRejectedValue(new Error("db down"))
  readKeys = []
  expect(await getAppNotificationFeed({ userId: "u1", organizationId: "org", projectId: null })).toEqual({ canNotify: false, items: [] })
})
