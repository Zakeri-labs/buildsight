// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SUNDAY_9 = "2026-10-25T05:00:00.000Z"
const SUNDAY_945 = "2026-10-25T05:45:00.000Z"
const availability = vi.fn()
const send = vi.fn()
vi.mock("@/lib/design-gallery/booking/actions", () => ({
  loadBookingAvailability: () => availability(),
  prepareBookingFileUpload: vi.fn(),
  sendMeetingRequest: (raw: unknown) => send(raw),
}))
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))

const { BookingWizard } = await import("./booking-wizard")

let container: HTMLDivElement
let root: Root
const days = [
  { date: "2026-10-25", weekday: 0, slots: [{ start: SUNDAY_9, end: SUNDAY_945, time: "09:00" }, { start: SUNDAY_945, end: "2026-10-25T06:30:00.000Z", time: "09:45" }] },
  { date: "2026-10-26", weekday: 1, slots: [] },
]

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  Element.prototype.scrollIntoView = vi.fn()
  availability.mockReset()
  availability.mockResolvedValue({ ok: true, data: { days, timeZone: "Asia/Muscat" } })
  send.mockReset()
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)))
const byText = (text: string) =>
  [...container.querySelectorAll<HTMLElement>("button, label, a")].find((el) => el.textContent?.includes(text))!
const click = (el: HTMLElement) => act(() => el.click())
function type(selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(selector)!
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
const choose = (label: string) => click(byText(label).querySelector("input") ?? byText(label))

function render(path: "same" | "modified" | "idea" = "modified") {
  act(() =>
    root.render(
      <BookingWizard
        locale="en"
        path={path}
        design={path === "idea" ? null : { slug: "modern-villa-pool", title: "Modern villa", code: "BD-101", coverUrl: null }}
        officeAddress="Mabela Industrial, Muscat"
        timeZone="Asia/Muscat"
        galleryHref="/designs?lang=en"
        backHref="/designs/modern-villa-pool?lang=en"
      />,
    ),
  )
}

function fillStepOne() {
  type('[data-field="clientName"]', "Ahmed Al Balushi")
  type('[data-field="whatsappPhone"]', "9123 4567")
  choose("Villa")
  choose("I own it, kroki ready")
  choose("Within 3 months")
}

test("step 1 shows what is missing and does not move on", async () => {
  render()
  await click(byText("Next: choose the time"))
  expect(container.textContent).toContain("Step 1 of 2")
  expect(container.querySelectorAll('[aria-invalid="true"]').length).toBeGreaterThanOrEqual(2)
  expect(container.textContent).toContain("Required.")
  expect(availability).not.toHaveBeenCalled()
})

test("a full booking: details, online meeting with email, a free time, confirmation", async () => {
  render()
  fillStepOne()
  await click(byText("Next: choose the time"))
  expect(container.textContent).toContain("Step 2 of 2")
  choose("Online")
  await flush()
  expect(availability).toHaveBeenCalledTimes(1)
  expect(container.textContent).toContain("Sun")
  expect(container.textContent).not.toContain("26") // days without free times are not offered
  choose("9:00")
  // Remote needs an email for the invitation.
  await click(byText("Confirm the booking"))
  expect(send).not.toHaveBeenCalled()
  expect(container.textContent).toContain("Required.")
  type('[data-field="email"]', "ahmed@example.com")
  send.mockResolvedValue({
    ok: true,
    data: { mode: "remote", startsAt: SUNDAY_9, timeZone: "Asia/Muscat", meetLink: "https://meet.google.com/abc-defg-hij", calendarInvite: true, officeAddressAr: null, officeAddressEn: null },
  })
  await act(async () => byText("Confirm the booking").click())
  await flush()
  expect(send).toHaveBeenCalledTimes(1)
  expect(send.mock.calls[0][0]).toMatchObject({
    path: "modified",
    designSlug: "modern-villa-pool",
    clientName: "Ahmed Al Balushi",
    whatsappPhone: "9123 4567",
    projectType: "villa",
    meetingMode: "remote",
    slotStart: SUNDAY_9,
    email: "ahmed@example.com",
    website: "",
    locale: "en",
  })
  expect(send.mock.calls[0][0].requestKey).toMatch(/^[0-9a-f-]{36}$/)
  expect(container.textContent).toContain("Your meeting is booked")
  expect(container.textContent).toContain("Sunday 25 October")
  expect(container.querySelector('a[href="https://meet.google.com/abc-defg-hij"]')).not.toBeNull()
})

test("a time taken meanwhile: the visitor is told, the times are reloaded, the same request key is reused", async () => {
  render("same")
  fillStepOne()
  await click(byText("Next: choose the time"))
  choose("At the office")
  await flush()
  choose("9:45")
  send.mockResolvedValueOnce({ ok: false, error: "slotTaken" })
  await act(async () => byText("Confirm the booking").click())
  await flush()
  expect(container.textContent).toContain("This time was just taken")
  expect(availability).toHaveBeenCalledTimes(2)
  choose("9:00")
  send.mockResolvedValueOnce({ ok: true, data: { mode: "office", startsAt: SUNDAY_9, timeZone: "Asia/Muscat", meetLink: null, calendarInvite: false, officeAddressAr: null, officeAddressEn: "Mabela Industrial, Muscat" } })
  await act(async () => byText("Confirm the booking").click())
  await flush()
  expect(send.mock.calls[1][0].requestKey).toBe(send.mock.calls[0][0].requestKey)
  expect(container.textContent).toContain("At our office: Mabela Industrial, Muscat")
})

test("call me: no time to choose; idea path needs a description", async () => {
  render("idea")
  fillStepOne()
  await click(byText("Next: choose the time"))
  expect(container.textContent).toContain("Describe your idea or add a file.")
  type('[data-field="ideaText"]', "Two floors, a courtyard")
  await click(byText("Next: choose the time"))
  choose("Call me")
  await flush()
  expect(availability).not.toHaveBeenCalled()
  send.mockResolvedValue({ ok: true, data: { mode: "call_me", startsAt: null, timeZone: "Asia/Muscat", meetLink: null, calendarInvite: false, officeAddressAr: null, officeAddressEn: null } })
  await act(async () => byText("Send the request").click())
  await flush()
  expect(send.mock.calls[0][0]).toMatchObject({ path: "idea", designSlug: "", meetingMode: "call_me", slotStart: "", ideaText: "Two floors, a courtyard" })
  expect(container.textContent).toContain("We received your request")
})
