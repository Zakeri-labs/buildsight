import { expect, test } from "vitest"

test("a failed console.assert fails the test instead of only logging", () => {
  const silence = console.error
  console.error = () => {}
  try {
    expect(() => console.assert(false, "boom")).toThrow("Assertion failed: boom")
    expect(() => console.assert(true, "fine")).not.toThrow()
  } finally {
    console.error = silence
  }
})
