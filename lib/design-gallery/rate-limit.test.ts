import { expect, test } from "vitest"
import { createRateLimiter } from "./rate-limit"

test("allows up to the limit per key in a window, then again once the window has passed", () => {
  const allow = createRateLimiter({ limit: 2, windowMs: 1000 })
  expect([allow("a", 0), allow("a", 10), allow("a", 20), allow("b", 20)]).toEqual([true, true, false, true])
  expect(allow("a", 1011)).toBe(true)
})

test("keeps memory bounded by forgetting the oldest keys", () => {
  const allow = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 2 })
  allow("a", 0)
  allow("b", 0)
  allow("c", 0) // "a" is forgotten
  expect(allow("a", 1)).toBe(true)
  expect(allow("c", 1)).toBe(false)
})
