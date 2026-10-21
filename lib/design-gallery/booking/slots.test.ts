import { describe, expect, test } from "vitest"
import { availableDays, DEFAULT_BOOKING_SETTINGS, findOfferedSlot, type BookingSettings } from "./slots"
import { addDays, zonedParts, zonedTimeToUtc } from "./timezone"

const muscat: BookingSettings = { ...DEFAULT_BOOKING_SETTINGS, daysAhead: 7 }
// Wednesday 21 Oct 2026, 16:00 in Muscat (12:00 UTC).
const now = new Date("2026-10-21T12:00:00Z")

describe("time zones", () => {
  test("Muscat wall-clock time to UTC and back", () => {
    expect(zonedTimeToUtc("2026-10-27", "10:30", "Asia/Muscat").toISOString()).toBe("2026-10-27T06:30:00.000Z")
    expect(zonedParts(new Date("2026-10-27T06:30:00Z"), "Asia/Muscat")).toMatchObject({ date: "2026-10-27", time: "10:30", weekday: 2 })
  })

  test("works across a daylight-saving change (Europe/London, 25 Oct 2026)", () => {
    expect(zonedTimeToUtc("2026-10-24", "09:00", "Europe/London").toISOString()).toBe("2026-10-24T08:00:00.000Z")
    expect(zonedTimeToUtc("2026-10-26", "09:00", "Europe/London").toISOString()).toBe("2026-10-26T09:00:00.000Z")
  })

  test("adding days crosses months", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02")
  })
})

describe("availableDays", () => {
  test("Sunday to Thursday, 09:00–17:00 Muscat, 45-minute slots, the last one ending by closing time", () => {
    const days = availableDays(muscat, now, [])
    expect(days.map((d) => [d.date, d.weekday])).toEqual([
      ["2026-10-21", 3],
      ["2026-10-22", 4],
      ["2026-10-25", 0],
      ["2026-10-26", 1],
      ["2026-10-27", 2],
    ])
    const sunday = days.find((d) => d.date === "2026-10-25")!
    expect(sunday.slots.map((s) => s.time)).toEqual(["09:00", "09:45", "10:30", "11:15", "12:00", "12:45", "13:30", "14:15", "15:00", "15:45"])
    expect(sunday.slots[0]).toEqual({ start: "2026-10-25T05:00:00.000Z", end: "2026-10-25T05:45:00.000Z", time: "09:00" })
  })

  test("nothing sooner than the notice period (12 hours)", () => {
    const days = availableDays(muscat, now, [])
    expect(days[0].slots).toEqual([]) // today, 16:00 → nothing left
    // Thursday: 12 hours after Wed 16:00 is Thu 04:00, so the whole day is open.
    expect(days[1].slots[0].time).toBe("09:00")
    const lateEvening = availableDays(muscat, new Date("2026-10-21T19:30:00Z"), []) // Wed 23:30 Muscat
    expect(lateEvening.find((d) => d.date === "2026-10-22")!.slots[0].time).toBe("12:00") // first slot ≥ Thu 11:30
  })

  test("busy times (calendar events, other bookings) remove every overlapping slot", () => {
    const busy = [{ start: new Date("2026-10-25T05:30:00Z"), end: new Date("2026-10-25T06:45:00Z") }] // 09:30–10:45 Muscat
    const sunday = availableDays(muscat, now, busy).find((d) => d.date === "2026-10-25")!
    expect(sunday.slots.map((s) => s.time).slice(0, 3)).toEqual(["11:15", "12:00", "12:45"])
  })

  test("a time skipped by a daylight-saving change is not offered, and no slot appears twice", () => {
    // New York, Sunday 8 March 2026: 02:00 jumps to 03:00.
    const ny: BookingSettings = { timeZone: "America/New_York", workDays: [0], dayStart: "00:30", dayEnd: "04:00", slotMinutes: 30, minNoticeHours: 0, daysAhead: 7 }
    const day = availableDays(ny, new Date("2026-03-07T12:00:00Z"), []).find((d) => d.date === "2026-03-08")!
    expect(day.slots.map((s) => s.time)).toEqual(["00:30", "01:00", "01:30", "03:00", "03:30"])
    expect(new Set(day.slots.map((s) => s.start)).size).toBe(day.slots.length)
  })

  test("the window ends after daysAhead days", () => {
    expect(availableDays({ ...muscat, daysAhead: 1 }, now, []).map((d) => d.date)).toEqual(["2026-10-21"])
  })
})

describe("findOfferedSlot", () => {
  test("accepts only a start time that is offered right now", () => {
    expect(findOfferedSlot(muscat, now, [], "2026-10-25T05:00:00.000Z")?.time).toBe("09:00")
    expect(findOfferedSlot(muscat, now, [], "2026-10-25T05:10:00.000Z")).toBeNull() // off the grid
    expect(findOfferedSlot(muscat, now, [], "2026-10-23T05:00:00.000Z")).toBeNull() // Friday
    expect(findOfferedSlot(muscat, now, [], "2026-10-21T13:00:00.000Z")).toBeNull() // too soon
    expect(findOfferedSlot(muscat, now, [{ start: new Date("2026-10-25T05:00:00Z"), end: new Date("2026-10-25T05:45:00Z") }], "2026-10-25T05:00:00.000Z")).toBeNull()
    expect(findOfferedSlot(muscat, now, [], "not a date")).toBeNull()
  })
})
