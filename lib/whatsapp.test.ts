import { expect, test } from "vitest"
import { buildShareMessage } from "@/lib/stage-translations/whatsapp-share"
import { whatsappUrl } from "./whatsapp"

test("builds a chat link to a number, keeping only digits", () => {
  expect(whatsappUrl("+968 9411-4511", "مرحبا & hi")).toBe(
    `https://wa.me/96894114511?text=${encodeURIComponent("مرحبا & hi")}`,
  )
})

test("without a number the user picks the chat", () => {
  expect(whatsappUrl(null, "hi")).toBe("https://wa.me/?text=hi")
  expect(whatsappUrl("  ", "hi")).toBe("https://wa.me/?text=hi")
})

test("the report share message still builds the same links", () => {
  const withPhone = buildShareMessage({ projectName: "P", projectId: "p1", responseId: "abc-1", phone: "+968 1234 5678" })
  expect(withPhone.whatsappUrl).toBe(`https://wa.me/96812345678?text=${encodeURIComponent(withPhone.text)}`)
  const withoutPhone = buildShareMessage({ projectName: "P", projectId: "p1", responseId: "abc-1" })
  expect(withoutPhone.whatsappUrl).toBe(`https://wa.me/?text=${encodeURIComponent(withoutPhone.text)}`)
})
