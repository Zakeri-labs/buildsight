// Paths that signed-out visitors may open. Each entry covers the path itself
// and everything below it ("/d" covers "/d/abc", not "/dashboard").
const PUBLIC_SEGMENTS = [
  "/auth",
  "/invite",
  "/_next",
  "/api/health",
  "/d",
  "/r",
  "/api/stage-translations/pdf",
  "/designs",
  "/api/designs",
]
// Plain prefixes for icon files next to the root (favicon.ico, favicon-32x32.png…).
const PUBLIC_PREFIXES = ["/favicon"]

export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_SEGMENTS.some((segment) => pathname === segment || pathname.startsWith(`${segment}/`)) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  )
}
