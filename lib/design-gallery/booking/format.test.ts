import { expect, test } from "vitest"
import { dayChip, meetingWhen, timeLabel } from "./format"

const SUNDAY_9_MUSCAT = "2026-10-25T05:00:00.000Z"

test("times are shown in the gallery's time zone, with Latin digits in Arabic too", () => {
  expect(timeLabel(SUNDAY_9_MUSCAT, "en", "Asia/Muscat")).toMatch(/^9:00\sAM$/)
  expect(timeLabel(SUNDAY_9_MUSCAT, "ar", "Asia/Muscat")).toBe("9:00 ص")
  expect(timeLabel("2026-10-25T12:30:00.000Z", "ar", "Asia/Muscat")).toBe("4:30 م")
})

test("day chips use the calendar date, whatever the visitor's own time zone", () => {
  expect(dayChip("2026-10-25", "en")).toEqual({ weekday: "Sun", day: "25", month: "Oct" })
  expect(dayChip("2026-10-25", "ar").weekday).toBe("الأحد")
  expect(dayChip("2026-10-25", "ar").day).toBe("25")
})

test("confirmation line", () => {
  expect(meetingWhen(SUNDAY_9_MUSCAT, "en", "Asia/Muscat")).toMatch(/^Sunday 25 October, 9:00\s?am$/i)
  expect(meetingWhen(SUNDAY_9_MUSCAT, "ar", "Asia/Muscat")).toBe("الأحد، 25 أكتوبر، 9:00 ص")
})
