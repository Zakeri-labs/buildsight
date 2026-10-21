import { expect, test } from "vitest"
import { isPublicPath } from "./public-paths"

test("public pages, short links and the design gallery are open to signed-out visitors", () => {
  for (const path of [
    "/auth/login",
    "/invite/abc",
    "/d/123",
    "/r/abc",
    "/designs",
    "/designs/modern-villa-pool",
    "/designs/sitemap.xml",
    "/api/designs/events",
    "/api/stage-translations/pdf",
    "/api/health",
    "/favicon.ico",
    "/favicon-32x32.png",
  ]) {
    expect(isPublicPath(path), path).toBe(true)
  }
})

test("app pages that only start with the same letters are not public", () => {
  for (const path of ["/", "/dashboard", "/documents", "/design-gallery", "/designsx", "/reports", "/report-entry", "/rfi", "/authx", "/api/designs-admin"]) {
    expect(isPublicPath(path), path).toBe(false)
  }
})
