import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DEFAULT_FONT_URLS = [
  "https://cdn.jsdelivr.net/gh/notofonts/noto-fonts@main/unhinted/ttf/NotoSansArabic/NotoSansArabic-Regular.ttf",
  "https://raw.githubusercontent.com/notofonts/noto-fonts/main/unhinted/ttf/NotoSansArabic/NotoSansArabic-Regular.ttf",
  "https://cdn.jsdelivr.net/gh/notofonts/noto-fonts@main/hinted/ttf/NotoNaskhArabic/NotoNaskhArabic-Regular.ttf",
]
const MIN_FONT_BYTES = 20_000
const MAX_FONT_BYTES = 2 * 1024 * 1024
let cachedFont: Uint8Array | null = null

function isSupportedFont(bytes: Uint8Array) {
  if (bytes.byteLength < MIN_FONT_BYTES || bytes.byteLength > MAX_FONT_BYTES) return false
  const signature = Array.from(bytes.subarray(0, 4)).map((value) => value.toString(16).padStart(2, "0")).join("")
  return signature === "00010000" || signature === "4f54544f" || signature === "74727565"
}

async function fetchFont() {
  if (cachedFont) return cachedFont
  const configured = process.env.ARABIC_PDF_FONT_URL?.trim()
  const candidates = configured ? [configured, ...DEFAULT_FONT_URLS] : DEFAULT_FONT_URLS
  let lastError = "No Arabic font source is available."

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        cache: "force-cache",
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) {
        lastError = `Font source returned status ${response.status}.`
        continue
      }
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (!isSupportedFont(bytes)) {
        lastError = "Font source returned an invalid or oversized TTF/OTF file."
        continue
      }
      cachedFont = bytes
      return bytes
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Arabic font download failed."
    }
  }
  throw new Error(lastError)
}

export async function GET() {
  try {
    const bytes = await fetchFont()
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "font/ttf",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load the PDF-safe Arabic font."
    return new NextResponse(`Unable to load the PDF-safe Arabic font. ${message}`, {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    })
  }
}
