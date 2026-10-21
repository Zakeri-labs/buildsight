import { expect, test } from "vitest"
import { validateBookingSettings } from "./settings"

const valid = {
  timeZone: "Asia/Muscat",
  workDays: ["4", "0", "1", "0"],
  dayStart: "09:00",
  dayEnd: "17:00",
  slotMinutes: "45",
  minNoticeHours: "12",
  daysAhead: "21",
  officeAddressAr: "  المعبيلة الصناعية، مسقط ",
  officeAddressEn: "",
}

test("valid settings are normalized", () => {
  expect(validateBookingSettings(valid)).toEqual({
    ok: true,
    value: {
      timeZone: "Asia/Muscat",
      workDays: [0, 1, 4],
      dayStart: "09:00",
      dayEnd: "17:00",
      slotMinutes: 45,
      minNoticeHours: 12,
      daysAhead: 21,
      officeAddressAr: "المعبيلة الصناعية، مسقط",
      officeAddressEn: null,
    },
  })
  // A single checked day arrives as a plain value; seconds from <input type="time"> are dropped.
  const one = validateBookingSettings({ ...valid, workDays: "3", dayStart: "08:30:00" })
  expect(one.ok && [one.value.workDays, one.value.dayStart]).toEqual([[3], "08:30"])
})

test("the same limits as the database", () => {
  const errors = (overrides: Record<string, unknown>) => {
    const result = validateBookingSettings({ ...valid, ...overrides })
    return result.ok ? {} : result.errors
  }
  expect(errors({ workDays: [] })).toEqual({ workDays: "required" })
  expect(errors({ workDays: ["7"] })).toEqual({ workDays: "outOfRange" })
  expect(errors({ dayStart: "9am" })).toEqual({ dayStart: "invalidTime" })
  expect(errors({ dayEnd: "" })).toEqual({ dayEnd: "required" })
  expect(errors({ dayEnd: "08:00" })).toEqual({ dayEnd: "outOfRange" }) // before the start
  expect(errors({ dayEnd: "09:30" })).toEqual({ dayEnd: "outOfRange" }) // no room for one meeting
  expect(errors({ slotMinutes: "10" })).toEqual({ slotMinutes: "outOfRange" })
  expect(errors({ slotMinutes: "45.5" })).toEqual({ slotMinutes: "invalidNumber" })
  expect(errors({ minNoticeHours: "200" })).toEqual({ minNoticeHours: "outOfRange" })
  expect(errors({ daysAhead: "0" })).toEqual({ daysAhead: "outOfRange" })
  expect(errors({ daysAhead: "" })).toEqual({ daysAhead: "required" })
  expect(errors({ timeZone: "Mars/Base" })).toEqual({ timeZone: "invalidTimeZone" })
  expect(errors({ officeAddressEn: "x".repeat(201) })).toEqual({ officeAddressEn: "tooLong" })
  expect(errors({ slotMinutes: "٤٥" })).toEqual({}) // Arabic digits
})
