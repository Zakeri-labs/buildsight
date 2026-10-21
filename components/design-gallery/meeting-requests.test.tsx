import { renderToStaticMarkup } from "react-dom/server"
import { expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import type { MeetingRequestRow } from "@/lib/design-gallery/booking/admin"

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))
const { MeetingRequests } = await import("./meeting-requests")

const base: MeetingRequestRow = {
  id: "r1",
  path: "modified",
  clientName: "أحمد البلوشي",
  whatsappPhone: "96891234567",
  email: "ahmed@example.com",
  projectType: "villa",
  landStatus: "owned_ready",
  wilayat: "bawshar",
  landAreaSqm: 600,
  startTimeline: "within_3_months",
  ideaText: null,
  meetingMode: "remote",
  startsAt: "2026-10-27T06:30:00Z",
  status: "confirmed",
  calendarStatus: "failed",
  meetLink: null,
  locale: "ar",
  source: "instagram",
  createdAt: "2026-10-21T10:00:00Z",
  design: { slug: "modern-villa-pool", code: "BD-101", titleAr: "فيلا عصرية بمسبح", titleEn: "Modern villa with pool" },
  attachments: [],
}

const render = (rows: MeetingRequestRow[]) =>
  renderToStaticMarkup(
    <I18nProvider>
      <MeetingRequests requests={rows} timeZone="Asia/Muscat" highlightId="r2" />
    </I18nProvider>,
  )

test("a request card has what the engineer needs: design, land, start, time in the gallery's zone, WhatsApp", () => {
  const html = render([base])
  for (const text of ["Modern villa with pool (BD-101) — with changes", "Villa", "Bawshar", "600 m²", "I own it, kroki ready", "Within 3 months", "Tuesday 27 October, 10:30 AM", "Confirmed", "Calendar event failed", "instagram"]) {
    expect(html).toContain(text)
  }
  expect(html).toContain('href="https://wa.me/96891234567?text="')
})

test("an idea with files and a call-back request: no time, file links, highlighted from the bell", () => {
  const html = render([
    {
      ...base,
      id: "r2",
      path: "idea",
      design: null,
      meetingMode: "call_me",
      startsAt: null,
      status: "new",
      calendarStatus: "not_needed",
      wilayat: "other:Dubai",
      ideaText: "Two floors",
      attachments: [
        { id: "f1", name: "a.pdf", contentType: "application/pdf", url: "https://signed.example/a" },
        { id: "f2", name: "b.jpg", contentType: "image/jpeg", url: null },
      ],
    },
  ])
  expect(html).toContain("Own idea")
  expect(html).toContain("Dubai")
  expect(html).toContain("Two floors")
  expect(html).toContain("<span>Call me</span></p>") // no meeting time after the mode
  expect(html).toContain('href="https://signed.example/a"')
  expect(html).not.toContain("File 2") // a file without a link is not shown
  expect(html).toMatch(/id="request-r2"[^>]*>\s*<div[^>]*ring-2/)
  expect(render([])).toContain("No requests yet.")
})
