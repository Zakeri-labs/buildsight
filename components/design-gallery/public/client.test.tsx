// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { HtmlLocale } from "./client"

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
