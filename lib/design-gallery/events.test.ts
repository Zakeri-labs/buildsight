import { describe, expect, test } from "vitest"
import { isBotUserAgent, parseGalleryEvent, referrerHost } from "./events"

describe("parseGalleryEvent", () => {
  test("accepts a design view with campaign details from Instagram", () => {
    expect(
      parseGalleryEvent(
        { type: "design_view", design: "modern-villa-pool", locale: "ar", referrer: "https://l.instagram.com/x", utm_source: "instagram", utm_medium: "story" },
        "app.bonyanec.com",
      ),
    ).toEqual({
      type: "design_view",
      intent: null,
      designSlug: "modern-villa-pool",
      locale: "ar",
      referrerHost: "l.instagram.com",
      utmSource: "instagram",
      utmMedium: "story",
      utmCampaign: null,
    })
  })

  test("a contact click needs a known intent; a design view needs a design", () => {
    expect(parseGalleryEvent({ type: "contact_click", intent: "same", design: "villa" }, null)?.intent).toBe("same")
    expect(parseGalleryEvent({ type: "contact_click", intent: "hack" }, null)).toBeNull()
    expect(parseGalleryEvent({ type: "contact_click" }, null)).toBeNull()
    expect(parseGalleryEvent({ type: "design_view" }, null)).toBeNull()
    expect(parseGalleryEvent({ type: "gallery_view", intent: "same" }, null)?.intent).toBeNull()
  })

  test("rejects unknown types and malformed bodies", () => {
    for (const body of [null, "x", 1, [], {}, { type: "delete" }, { type: "design_view", design: "../../etc" }, { type: "design_view", design: "A B" }]) {
      expect(parseGalleryEvent(body, null), JSON.stringify(body)).toBeNull()
    }
  })

  test("long or control-character campaign values are trimmed, not stored as-is", () => {
    const event = parseGalleryEvent({ type: "gallery_view", utm_campaign: `x\u0000y${"z".repeat(200)}` }, null)
    expect(event?.utmCampaign).toHaveLength(100)
    expect(event?.utmCampaign?.startsWith("xy")).toBe(true)
    expect(parseGalleryEvent({ type: "gallery_view", utm_source: 5 }, null)?.utmSource).toBeNull()
  })
})

test("referrer: other sites by host, our own pages and junk are ignored", () => {
  expect(referrerHost("https://www.google.com/search?q=x", "app.bonyanec.com")).toBe("www.google.com")
  expect(referrerHost("https://app.bonyanec.com/designs", "app.bonyanec.com:443")).toBeNull()
  expect(referrerHost("android-app://com.google", "x")).toBeNull()
  expect(referrerHost("not a url", "x")).toBeNull()
  expect(referrerHost(42, "x")).toBeNull()
})

test("crawlers and link previews are not counted", () => {
  expect(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true)
  expect(isBotUserAgent("WhatsApp/2.23.20.0")).toBe(true)
  expect(isBotUserAgent("")).toBe(true)
  expect(isBotUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1")).toBe(false)
})
