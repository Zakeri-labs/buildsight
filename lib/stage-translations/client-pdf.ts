"use client"

const HTML2PDF_SCRIPT_ID = "buildsight-html2pdf"
const HTML2PDF_SCRIPT_URL = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"
const HTML2PDF_INTEGRITY = "sha512-GsLlZN/3F2ErC5ifS5QtgpiJtWd43JWSuIgh7mbzZ8zBps+dvLusV+eNQATqgA/HdeKFVgA5v3S/cIrLF7QnIg=="
const MAX_CANVAS_DIMENSION = 30_000

const PDF_SAFE_CSS = `
  :root { color-scheme: light !important; }
  html, body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; }
  *, *::before, *::after { box-sizing: border-box; }
  .stage-translation-pdf-export {
    background: #ffffff !important;
    color: rgb(30, 41, 59) !important;
    box-shadow: none !important;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
  .stage-translation-pdf-export .stage-translation-no-break,
  .stage-translation-pdf-export table,
  .stage-translation-pdf-export tr,
  .stage-translation-pdf-export figure,
  .stage-translation-pdf-export img {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .stage-translation-pdf-export .stage-translation-richtext { overflow-wrap: anywhere; }
  .stage-translation-pdf-export img { max-width: 100%; }
  .stage-translation-pdf-export table { border-collapse: collapse; }
`

const STYLE_PROPERTIES = [
  "box-sizing", "display", "position", "float", "clear", "overflow", "overflow-x", "overflow-y",
  "flex-direction", "flex-wrap", "flex-grow", "flex-shrink", "flex-basis", "align-items", "align-content",
  "align-self", "justify-content", "justify-items", "justify-self", "gap", "row-gap", "column-gap",
  "grid-template-columns", "grid-template-rows", "grid-column", "grid-row", "grid-auto-flow",
  "width", "min-width", "max-width", "height", "min-height", "max-height", "aspect-ratio",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius",
  "background-color", "background-image", "background-size", "background-position", "background-repeat",
  "color", "opacity", "visibility",
  "font-family", "font-size", "font-weight", "font-style", "font-variant", "line-height", "letter-spacing",
  "text-align", "text-align-last", "text-decoration-line", "text-decoration-color", "text-decoration-style",
  "text-transform", "text-indent", "text-overflow", "text-shadow", "white-space", "word-break", "overflow-wrap",
  "direction", "unicode-bidi", "vertical-align",
  "list-style-type", "list-style-position", "border-collapse", "border-spacing", "table-layout", "caption-side",
  "object-fit", "object-position", "break-before", "break-after", "break-inside",
  "page-break-before", "page-break-after", "page-break-inside",
  "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
] as const

const COLOR_PROPERTIES = new Set([
  "color", "background-color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "text-decoration-color", "fill", "stroke",
])

const COLOR_FALLBACKS: Record<string, string> = {
  color: "rgb(30, 41, 59)",
  "background-color": "rgba(0, 0, 0, 0)",
  "border-top-color": "rgb(203, 213, 225)",
  "border-right-color": "rgb(203, 213, 225)",
  "border-bottom-color": "rgb(203, 213, 225)",
  "border-left-color": "rgb(203, 213, 225)",
  "text-decoration-color": "rgb(30, 41, 59)",
  fill: "rgb(30, 41, 59)",
  stroke: "rgb(30, 41, 59)",
}

type Html2PdfFactory = () => any
type PdfWindow = Window & { html2pdf?: Html2PdfFactory }

let loaderPromise: Promise<Html2PdfFactory> | null = null

function loadHtml2Pdf() {
  if (typeof window === "undefined") return Promise.reject(new Error("PDF export is available only in the browser."))
  const pdfWindow = window as PdfWindow
  if (pdfWindow.html2pdf) return Promise.resolve(pdfWindow.html2pdf)
  if (loaderPromise) return loaderPromise

  loaderPromise = new Promise<Html2PdfFactory>((resolve, reject) => {
    const existing = document.getElementById(HTML2PDF_SCRIPT_ID) as HTMLScriptElement | null
    const script = existing ?? document.createElement("script")
    const timeout = window.setTimeout(() => {
      loaderPromise = null
      reject(new Error("PDF tools did not load. Check the network connection and try again."))
    }, 20_000)

    const finish = () => {
      window.clearTimeout(timeout)
      if (!pdfWindow.html2pdf) {
        loaderPromise = null
        reject(new Error("PDF tools failed to initialize. Refresh the page and try again."))
        return
      }
      resolve(pdfWindow.html2pdf)
    }
    const fail = () => {
      window.clearTimeout(timeout)
      loaderPromise = null
      script.remove()
      reject(new Error("PDF tools could not be loaded. Check the network connection and try again."))
    }

    script.addEventListener("load", finish, { once: true })
    script.addEventListener("error", fail, { once: true })
    if (!existing) {
      script.id = HTML2PDF_SCRIPT_ID
      script.src = HTML2PDF_SCRIPT_URL
      script.async = true
      script.crossOrigin = "anonymous"
      script.referrerPolicy = "no-referrer"
      script.integrity = HTML2PDF_INTEGRITY
      document.head.appendChild(script)
    }
  })

  return loaderPromise
}

function waitForImages(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll("img"))
  return Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve()
    return new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true })
      image.addEventListener("error", () => resolve(), { once: true })
      window.setTimeout(resolve, 15_000)
    })
  }))
}

function safeFilename(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized || "inspection-report"
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.style.display = "none"
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value))
}

function parseCssNumber(value: string, percentageScale = 1) {
  const normalized = value.trim().toLowerCase()
  if (normalized.endsWith("%")) return (Number.parseFloat(normalized) / 100) * percentageScale
  return Number.parseFloat(normalized)
}

function parseAlpha(value: string | undefined) {
  if (!value) return 1
  return clamp(parseCssNumber(value, 1))
}

function parseHue(value: string) {
  const normalized = value.trim().toLowerCase()
  const number = Number.parseFloat(normalized)
  if (!Number.isFinite(number)) return 0
  if (normalized.endsWith("rad")) return number * (180 / Math.PI)
  if (normalized.endsWith("turn")) return number * 360
  if (normalized.endsWith("grad")) return number * 0.9
  return number
}

function splitColorFunctionBody(body: string) {
  const [channelsPart, alphaPart] = body.split("/").map((part) => part.trim())
  const channels = channelsPart.replaceAll(",", " ").split(/\s+/).filter(Boolean)
  return { channels, alpha: parseAlpha(alphaPart) }
}

function linearToSrgb(value: number) {
  const converted = value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055
  return Math.round(clamp(converted) * 255)
}

function rgbString(red: number, green: number, blue: number, alpha = 1) {
  if (alpha < 0.999) return `rgba(${red}, ${green}, ${blue}, ${Number(alpha.toFixed(4))})`
  return `rgb(${red}, ${green}, ${blue})`
}

function xyzD65ToRgb(x: number, y: number, z: number, alpha: number) {
  const red = 3.2406 * x - 1.5372 * y - 0.4986 * z
  const green = -0.9689 * x + 1.8758 * y + 0.0415 * z
  const blue = 0.0557 * x - 0.204 * y + 1.057 * z
  return rgbString(linearToSrgb(red), linearToSrgb(green), linearToSrgb(blue), alpha)
}

function labToRgb(channels: string[], alpha: number, cylindrical: boolean) {
  if (channels.length < 3) return null
  const lightness = parseCssNumber(channels[0], 100)
  let a: number
  let b: number
  if (cylindrical) {
    const chroma = parseCssNumber(channels[1], 150)
    const hueRadians = parseHue(channels[2]) * (Math.PI / 180)
    a = chroma * Math.cos(hueRadians)
    b = chroma * Math.sin(hueRadians)
  } else {
    a = parseCssNumber(channels[1], 125)
    b = parseCssNumber(channels[2], 125)
  }
  if (![lightness, a, b].every(Number.isFinite)) return null

  const fy = (lightness + 16) / 116
  const fx = fy + a / 500
  const fz = fy - b / 200
  const epsilon = 216 / 24389
  const kappa = 24389 / 27
  const inverse = (value: number) => Math.pow(value, 3) > epsilon ? Math.pow(value, 3) : (116 * value - 16) / kappa

  const x50 = 0.96422 * inverse(fx)
  const y50 = inverse(fy)
  const z50 = 0.82521 * inverse(fz)
  const x65 = 0.9555766 * x50 - 0.0230393 * y50 + 0.0631636 * z50
  const y65 = -0.0282895 * x50 + 1.0099416 * y50 + 0.0210077 * z50
  const z65 = 0.0122982 * x50 - 0.020483 * y50 + 1.3299098 * z50
  return xyzD65ToRgb(x65, y65, z65, alpha)
}

function oklabToRgb(channels: string[], alpha: number, cylindrical: boolean) {
  if (channels.length < 3) return null
  const lightness = parseCssNumber(channels[0], 1)
  let a: number
  let b: number
  if (cylindrical) {
    const chroma = parseCssNumber(channels[1], 0.4)
    const hueRadians = parseHue(channels[2]) * (Math.PI / 180)
    a = chroma * Math.cos(hueRadians)
    b = chroma * Math.sin(hueRadians)
  } else {
    a = parseCssNumber(channels[1], 0.4)
    b = parseCssNumber(channels[2], 0.4)
  }
  if (![lightness, a, b].every(Number.isFinite)) return null

  const l = Math.pow(lightness + 0.3963377774 * a + 0.2158037573 * b, 3)
  const m = Math.pow(lightness - 0.1055613458 * a - 0.0638541728 * b, 3)
  const s = Math.pow(lightness - 0.0894841775 * a - 1.291485548 * b, 3)
  const red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  return rgbString(linearToSrgb(red), linearToSrgb(green), linearToSrgb(blue), alpha)
}

function convertUnsupportedColorFunctions(value: string) {
  return value.replace(/\b(oklch|oklab|lch|lab)\(([^()]*)\)/gi, (match, functionName: string, body: string) => {
    const { channels, alpha } = splitColorFunctionBody(body)
    const normalized = functionName.toLowerCase()
    const converted = normalized === "oklch"
      ? oklabToRgb(channels, alpha, true)
      : normalized === "oklab"
        ? oklabToRgb(channels, alpha, false)
        : normalized === "lch"
          ? labToRgb(channels, alpha, true)
          : labToRgb(channels, alpha, false)
    return converted ?? match
  })
}

function safeCssValue(property: string, value: string) {
  const sanitized = convertUnsupportedColorFunctions(value.trim())
  if (/\bvar\s*\(/i.test(sanitized) || /\b(?:oklch|oklab|lch|lab|color-mix|color|light-dark)\s*\(/i.test(sanitized)) {
    return COLOR_FALLBACKS[property] ?? ""
  }
  if (property === "background-image" && /\b(?:paint|element|cross-fade|image-set)\s*\(/i.test(sanitized)) return "none"
  if (property === "text-shadow") return "none"
  if (COLOR_PROPERTIES.has(property) && !sanitized) return COLOR_FALLBACKS[property]
  return sanitized
}

function removeUnsafeNodesAndAttributes(root: HTMLElement) {
  root.querySelectorAll("script, style, link, iframe, object, embed, form, input, button, textarea, select, option, meta, base").forEach((node) => node.remove())
  for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim()
      if (name.startsWith("on") || name === "srcdoc") element.removeAttribute(attribute.name)
      if ((name === "href" || name === "src" || name === "xlink:href") && /^(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/i.test(value)) {
        element.removeAttribute(attribute.name)
      }
    }
  }
}

function inlinePdfSafeStyles(source: HTMLElement, clone: HTMLElement) {
  const sourceElements = [source, ...Array.from(source.querySelectorAll<HTMLElement>("*"))]
  const cloneElements = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))]
  const count = Math.min(sourceElements.length, cloneElements.length)

  for (let index = 0; index < count; index += 1) {
    const sourceElement = sourceElements[index]
    const cloneElement = cloneElements[index]
    const computed = window.getComputedStyle(sourceElement)
    const preservedClasses = ["stage-translation-no-break", "stage-translation-richtext"]
      .filter((className) => cloneElement.classList.contains(className))
    cloneElement.removeAttribute("class")
    cloneElement.removeAttribute("id")
    if (preservedClasses.length) cloneElement.classList.add(...preservedClasses)
    cloneElement.removeAttribute("style")

    for (const property of STYLE_PROPERTIES) {
      const safeValue = safeCssValue(property, computed.getPropertyValue(property))
      if (safeValue) cloneElement.style.setProperty(property, safeValue, "important")
    }

    cloneElement.style.setProperty("box-shadow", "none", "important")
    cloneElement.style.setProperty("filter", "none", "important")
    cloneElement.style.setProperty("backdrop-filter", "none", "important")
    cloneElement.style.setProperty("mix-blend-mode", "normal", "important")
    cloneElement.style.setProperty("animation", "none", "important")
    cloneElement.style.setProperty("transition", "none", "important")
    cloneElement.style.setProperty("caret-color", "transparent", "important")
  }

  clone.style.setProperty("position", "relative", "important")
  clone.style.setProperty("inset", "auto", "important")
  clone.style.setProperty("transform", "none", "important")
  clone.style.setProperty("background-color", "rgb(255, 255, 255)", "important")
  clone.style.setProperty("color", "rgb(30, 41, 59)", "important")
}

function collectPdfFontFaceCss() {
  const rules: string[] = []
  for (const styleSheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(styleSheet.cssRules)) {
        if (rule.type === CSSRule.FONT_FACE_RULE) rules.push(rule.cssText)
      }
    } catch {
      // Cross-origin stylesheets cannot be inspected. The app's Next.js font rules are same-origin.
    }
  }
  return rules.join("\n")
}

function sanitizeClonedDocument(clonedDocument: Document, fontFaceCss: string) {
  clonedDocument.querySelectorAll('style, link[rel="stylesheet"], link[rel="preload"][as="style"]').forEach((node) => node.remove())
  const style = clonedDocument.createElement("style")
  style.setAttribute("data-buildsight-pdf-safe", "true")
  style.textContent = `${fontFaceCss}\n${PDF_SAFE_CSS}`
  clonedDocument.head.appendChild(style)

  for (const element of Array.from(clonedDocument.querySelectorAll<HTMLElement>("*"))) {
    for (const property of STYLE_PROPERTIES) {
      const current = element.style.getPropertyValue(property)
      if (!current) continue
      const safeValue = safeCssValue(property, current)
      if (safeValue) element.style.setProperty(property, safeValue, "important")
      else element.style.removeProperty(property)
    }
    for (const property of Array.from(element.style)) {
      const value = element.style.getPropertyValue(property)
      if (property.startsWith("--") || /\bvar\s*\(/i.test(value) || /\b(?:oklch|oklab|lch|lab|color-mix|color|light-dark)\s*\(/i.test(value)) {
        element.style.removeProperty(property)
      }
    }
  }
}

export async function exportTranslationPdf({
  source,
  projectName,
  projectReference,
  documentNumber,
  kind,
}: {
  source: HTMLElement
  projectName: string
  projectReference: string | null
  documentNumber: string
  kind: "original" | "arabic" | "bilingual"
}) {
  const html2pdf = await loadHtml2Pdf()
  await document.fonts?.ready

  const landscape = kind === "bilingual"
  const width = landscape ? 1123 : 794
  const host = document.createElement("div")
  host.setAttribute("aria-hidden", "true")
  host.style.position = "fixed"
  host.style.inset = "0 auto auto -10000px"
  host.style.width = `${width}px`
  host.style.zIndex = "-1"
  host.style.background = "#ffffff"

  const clone = source.cloneNode(true) as HTMLElement
  inlinePdfSafeStyles(source, clone)
  removeUnsafeNodesAndAttributes(clone)
  clone.classList.add("stage-translation-pdf-export")
  clone.style.setProperty("width", `${width}px`, "important")
  clone.style.setProperty("max-width", `${width}px`, "important")
  clone.style.setProperty("border", "0", "important")
  clone.style.setProperty("border-radius", "0", "important")
  clone.style.setProperty("box-shadow", "none", "important")
  clone.style.setProperty("background", "rgb(255, 255, 255)", "important")
  host.appendChild(clone)
  document.body.appendChild(host)

  try {
    await waitForImages(clone)
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    const base = safeFilename(projectReference || projectName)
    const suffix = kind === "original" ? "english-original" : kind === "arabic" ? "arabic-translation" : "bilingual"
    const filename = `${base}-${safeFilename(documentNumber)}-${suffix}.pdf`
    const renderHeight = Math.max(clone.scrollHeight, clone.getBoundingClientRect().height, 1)
    const scale = Math.min(2, MAX_CANVAS_DIMENSION / Math.max(width, renderHeight))
    const fontFaceCss = collectPdfFontFaceCss()
    const options = {
      margin: [10, 10, 14, 10],
      filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0,
        windowWidth: width,
        windowHeight: Math.ceil(renderHeight),
        imageTimeout: 15_000,
        logging: false,
        removeContainer: true,
        onclone: (clonedDocument: Document) => sanitizeClonedDocument(clonedDocument, fontFaceCss),
      },
      jsPDF: { unit: "mm", format: "a4", orientation: landscape ? "landscape" : "portrait", compress: true },
      pagebreak: { mode: ["css", "legacy"], avoid: [".stage-translation-no-break", "table", "tr", "figure", "img"] },
    }

    const worker = (html2pdf() as any).set(options).from(clone).toPdf()
    const pdf = await worker.get("pdf")
    const pageCount = pdf.internal.getNumberOfPages()
    for (let page = 1; page <= pageCount; page += 1) {
      pdf.setPage(page)
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      pdf.setFontSize(8)
      pdf.setTextColor(100, 100, 100)
      pdf.text(`${page} / ${pageCount}`, pageWidth / 2, pageHeight - 5, { align: "center" })
    }
    const blob = pdf.output("blob") as Blob
    downloadBlob(blob, filename)
    return { blob, filename }
  } finally {
    host.remove()
  }
}
