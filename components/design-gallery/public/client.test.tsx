// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { BookingLink, HtmlLocale } from "./client"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
const html = document.documentElement

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  window.localStorage.setItem("buildsight-locale", "en")
  html.setAttribute("lang", "en")
  html.setAttribute("dir", "ltr")
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  window.localStorage.clear()
})

test("a public Arabic page keeps <html> Arabic/RTL even though the app language is English", () => {
  act(() =>
    root.render(
      <I18nProvider>
        <HtmlLocale locale="ar" />
      </I18nProvider>,
    ),
  )
  expect([html.lang, html.dir]).toEqual(["ar", "rtl"])
  expect(html.hasAttribute("data-locale-locked")).toBe(true)
})

test("leaving the public page gives <html> back to the app language", () => {
  window.localStorage.setItem("buildsight-locale", "ar")
  const page = (showGallery: boolean) => (
    <I18nProvider>{showGallery ? <HtmlLocale locale="en" /> : <p>app</p>}</I18nProvider>
  )
  act(() => root.render(page(true)))
  expect([html.lang, html.dir]).toEqual(["en", "ltr"])
  act(() => root.render(page(false)))
  expect([html.lang, html.dir]).toEqual(["ar", "rtl"])
  expect(html.hasAttribute("data-locale-locked")).toBe(false)
})

test("a booking button is counted as a contact of its kind before opening the form", () => {
  const beacons: string[] = []
  Object.defineProperty(navigator, "sendBeacon", {
    configurable: true,
    value: (_url: string, blob: Blob) => {
      beacons.push(blob as unknown as string)
      return true
    },
  })
  act(() =>
    root.render(
      <BookingLink href="/designs/book?design=villa&path=modified" intent="modified" design="villa" locale="ar">
        book
      </BookingLink>,
    ),
  )
  const link = container.querySelector("a")!
  expect(link.getAttribute("href")).toBe("/designs/book?design=villa&path=modified")
  link.addEventListener("click", (event) => event.preventDefault())
  act(() => link.click())
  expect(beacons).toHaveLength(1)
})
