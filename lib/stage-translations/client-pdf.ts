"use client"

import { extractSourcePdf, loadPdfJs } from "@/lib/stage-translations/client-source-pdf"
import {
  buildLanguagePdfTemplate,
  validateLanguagePdfTemplate,
  type ExtractedPdfImage,
  type ExtractedPdfLayoutBlock,
  type ExtractedSourceDocument,
  type LanguagePdfTemplate,
  type PdfKind,
  type PdfSectionTemplate,
} from "@/lib/stage-translations/pdf-templates"
import { getSourcePdfAttachment } from "@/lib/stage-translations/source-document"
import type { StageTranslationPageData, StageTranslationRecord } from "@/lib/stage-translations/types"
import { createClient as createSupabaseClient } from "@/lib/supabase/client"
import { getOrganizationProfile } from "@/lib/organization/profile"

const JSPDF_SCRIPT_ID = "buildsight-jspdf"
const JSPDF_SCRIPT_URLS = [
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
  "https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js",
]
const AUTOTABLE_SCRIPT_ID = "buildsight-jspdf-autotable"
const AUTOTABLE_SCRIPT_URLS = [
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.4/jspdf.plugin.autotable.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js",
  "https://unpkg.com/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js",
]
const ARABIC_FONT_FILENAME = "NotoNaskhArabic-Regular.ttf"
const ARABIC_FONT_FAMILY = "NotoNaskhArabic"
const ARABIC_FONT_URL = "/api/stage-translations/font"

const TRANSLATION_BUCKET = "project-stage-translations"
const MAX_PDF_BYTES = 60 * 1024 * 1024

const PAGE = {
  portraitWidth: 210,
  portraitHeight: 297,
  landscapeWidth: 297,
  landscapeHeight: 210,
  margin: 14,
  footer: 10,
} as const

type JsPdfDocument = any
type JsPdfConstructor = new (options?: Record<string, unknown>) => JsPdfDocument
type JsPdfWindow = Window & { jspdf?: { jsPDF?: JsPdfConstructor } }

const ARABIC_TEXT_OPTIONS = {
  // jsPDF's global setR2L flag performs a raw character reversal. That breaks
  // numbers, punctuation and mixed Arabic/Latin construction references.
  // These options use the bundled Unicode BiDi engine instead.
  R2L: false,
  isInputVisual: false,
  isOutputVisual: true,
  isInputRtl: true,
  isOutputRtl: false,
  isSymmetricSwapping: true,
} as const

type PdfBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "image"; src: string; caption: string; preferredWidthRatio?: number; preferredHeightRatio?: number; alignment?: "left" | "center" | "right" }
  | { type: "spacer"; height: number }

type LoadedImage = { dataUrl: string; width: number; height: number }

type Flow = {
  doc: JsPdfDocument
  template: LanguagePdfTemplate
  rtl: boolean
  pageWidth: number
  pageHeight: number
  x: number
  y: number
  width: number
  bottom: number
  pageNumber: number
  logoImage?: LoadedImage | null
}

let pdfToolsPromise: Promise<JsPdfConstructor> | null = null
let arabicFontPromise: Promise<string> | null = null
const imageCache = new Map<string, Promise<LoadedImage | null>>()

function loadScript(id: string, src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null
    if (existing?.dataset.loaded === "1") {
      resolve()
      return
    }
    if (existing) existing.remove()
    const script = document.createElement("script")
    const timeout = window.setTimeout(() => {
      script.remove()
      reject(new Error(`PDF library timed out: ${id}`))
    }, 20_000)
    const finish = () => {
      window.clearTimeout(timeout)
      script.dataset.loaded = "1"
      resolve()
    }
    const fail = () => {
      window.clearTimeout(timeout)
      script.remove()
      reject(new Error(`PDF library could not be loaded: ${id}`))
    }
    script.addEventListener("load", finish, { once: true })
    script.addEventListener("error", fail, { once: true })
    script.id = id
    script.src = src
    script.async = true
    script.crossOrigin = "anonymous"
    script.referrerPolicy = "no-referrer"
    document.head.appendChild(script)
  })
}

async function loadScriptFromCandidates(id: string, urls: string[]) {
  let lastError: unknown = null
  for (const url of urls) {
    try {
      await loadScript(id, url)
      return
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`PDF library could not be loaded: ${id}`)
}

async function loadPdfTools() {
  if (pdfToolsPromise) return pdfToolsPromise
  pdfToolsPromise = (async () => {
    await loadScriptFromCandidates(JSPDF_SCRIPT_ID, JSPDF_SCRIPT_URLS)
    const constructor = (window as JsPdfWindow).jspdf?.jsPDF
    if (!constructor) throw new Error("The PDF generator failed to initialize.")
    await loadScriptFromCandidates(AUTOTABLE_SCRIPT_ID, AUTOTABLE_SCRIPT_URLS)
    return constructor
  })().catch((error) => {
    pdfToolsPromise = null
    throw error
  })
  return pdfToolsPromise
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunk, bytes.length)))
  }
  return window.btoa(binary)
}

async function loadArabicFontBase64() {
  if (arabicFontPromise) return arabicFontPromise
  arabicFontPromise = (async () => {
    const response = await fetch(ARABIC_FONT_URL, { cache: "force-cache", credentials: "same-origin" })
    if (!response.ok) {
      const details = await response.text().catch(() => "")
      throw new Error(details || `Arabic font request failed with status ${response.status}.`)
    }
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength < 20_000) throw new Error("Arabic font response is invalid.")
    return arrayBufferToBase64(bytes)
  })().catch((error) => {
    arabicFontPromise = null
    throw error
  })
  return arabicFontPromise
}

async function installArabicFont(doc: JsPdfDocument) {
  const base64 = await loadArabicFontBase64()
  if (!doc.existsFileInVFS?.(ARABIC_FONT_FILENAME)) doc.addFileToVFS(ARABIC_FONT_FILENAME, base64)
  const fontList = doc.getFontList?.() as Record<string, string[]> | undefined
  if (!fontList?.[ARABIC_FONT_FAMILY]) {
    doc.addFont(ARABIC_FONT_FILENAME, ARABIC_FONT_FAMILY, "normal")
  }
  doc.setFont(ARABIC_FONT_FAMILY, "normal")
  doc.setLanguage?.("ar-SA")
  doc.setR2L?.(false)

  if (typeof doc.processArabic !== "function") {
    throw new Error("The PDF library does not include Arabic glyph shaping support.")
  }
  const shapingProbe = String(doc.processArabic("مرحبا"))
  if (!/[\uFB50-\uFDFF\uFE70-\uFEFF]/.test(shapingProbe)) {
    throw new Error("The PDF library could not initialize Arabic glyph shaping.")
  }
}

export function safePdfFilename(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized || "inspection-report"
}

export function downloadPdfBlob(blob: Blob, filename: string) {
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

export async function storeTranslationPdf(input: {
  projectId: string
  translationId: string
  kind: PdfKind
  blob: Blob
  filename: string
}) {
  if (input.blob.size <= 0 || input.blob.size > MAX_PDF_BYTES) {
    throw new Error("The generated PDF is empty or exceeds the 60 MB Storage limit.")
  }
  const signature = new TextDecoder("ascii").decode(new Uint8Array(await input.blob.slice(0, 5).arrayBuffer()))
  if (signature !== "%PDF-") throw new Error("The generated file is not a valid PDF.")

  const prepareResponse = await fetch("/api/stage-translations/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "prepare",
      projectId: input.projectId,
      translationId: input.translationId,
      kind: input.kind,
      filename: input.filename,
    }),
  })
  const prepared = await prepareResponse.json().catch(() => null)
  if (!prepareResponse.ok || !prepared?.storagePath || !prepared?.token) {
    throw new Error(prepared?.error || "Unable to prepare Supabase Storage upload.")
  }

  const storagePath = String(prepared.storagePath)
  const token = String(prepared.token)
  const supabase = createSupabaseClient()
  const { error: uploadError } = await supabase.storage
    .from(TRANSLATION_BUCKET)
    .uploadToSignedUrl(storagePath, token, input.blob, {
      contentType: "application/pdf",
      cacheControl: "3600",
    })
  if (uploadError) throw new Error(`Supabase Storage upload failed: ${uploadError.message}`)

  const finalizeResponse = await fetch("/api/stage-translations/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "finalize",
      projectId: input.projectId,
      translationId: input.translationId,
      kind: input.kind,
      storagePath,
    }),
  })
  const finalized = await finalizeResponse.json().catch(() => null)
  if (!finalizeResponse.ok) throw new Error(finalized?.error || "The PDF was uploaded, but its saved path could not be finalized.")
  return String(finalized.storagePath || storagePath)
}

function normalizeText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
}

function containsArabic(value: string) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(value)
}

function directChildElements(element: Element, selector: string) {
  return Array.from(element.children).filter((child) => child.matches(selector))
}

function htmlToBlocks(html: string): PdfBlock[] {
  if (!html.trim()) return []
  const documentNode = new DOMParser().parseFromString(`<div id="pdf-content">${html}</div>`, "text/html")
  const root = documentNode.getElementById("pdf-content")
  if (!root) return []
  root.querySelectorAll("script,style,iframe,object,embed,form,input,button,textarea,select,meta,link,base").forEach((node) => node.remove())
  root.querySelectorAll("*").forEach((node) => {
    for (const attribute of Array.from(node.attributes)) {
      if (/^on/i.test(attribute.name) || ["class", "id", "style"].includes(attribute.name.toLowerCase())) {
        node.removeAttribute(attribute.name)
      }
    }
  })

  const blocks: PdfBlock[] = []
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = normalizeText(node.textContent || "")
      if (text) blocks.push({ type: "paragraph", text })
      return
    }
    if (!(node instanceof Element)) return
    const tag = node.tagName.toLowerCase()
    if (/^h[1-6]$/.test(tag)) {
      const text = normalizeText(node.textContent || "")
      if (text) blocks.push({ type: "heading", level: Number(tag.slice(1)), text })
      return
    }
    if (tag === "p" || tag === "blockquote") {
      const text = normalizeText(node.textContent || "")
      if (text) blocks.push({ type: "paragraph", text })
      for (const image of Array.from(node.querySelectorAll(":scope > img"))) visit(image)
      return
    }
    if (tag === "ul" || tag === "ol") {
      const items = directChildElements(node, "li").map((item) => normalizeText(item.textContent || "")).filter(Boolean)
      if (items.length) blocks.push({ type: "list", ordered: tag === "ol", items })
      return
    }
    if (tag === "table") {
      const rows = Array.from(node.querySelectorAll("tr")).map((row) =>
        Array.from(row.querySelectorAll(":scope > th, :scope > td")).map((cell) => normalizeText(cell.textContent || "")),
      ).filter((row) => row.length)
      if (rows.length) {
        const firstRow = node.querySelector("tr")
        const hasHeader = Boolean(firstRow?.querySelector("th"))
        blocks.push({
          type: "table",
          headers: hasHeader ? rows[0] : [],
          rows: hasHeader ? rows.slice(1) : rows,
        })
      }
      return
    }
    if (tag === "img") {
      const src = node.getAttribute("src")?.trim()
      if (src) blocks.push({ type: "image", src, caption: node.getAttribute("alt") || "" })
      return
    }
    if (tag === "figure") {
      const image = node.querySelector("img")
      const src = image?.getAttribute("src")?.trim()
      if (src) {
        blocks.push({
          type: "image",
          src,
          caption: normalizeText(node.querySelector("figcaption")?.textContent || image?.getAttribute("alt") || ""),
        })
      }
      return
    }
    if (tag === "br") {
      blocks.push({ type: "spacer", height: 2 })
      return
    }
    for (const child of Array.from(node.childNodes)) visit(child)
  }

  for (const child of Array.from(root.childNodes)) visit(child)
  return blocks
}

function imageTemplateBlock(image: NonNullable<PdfSectionTemplate["images"]>[number]): PdfBlock {
  return {
    type: "image",
    src: image.src,
    caption: image.caption,
    preferredWidthRatio: image.preferredWidthRatio,
    alignment: image.alignment,
  }
}

function interleaveFlowImages(
  blocks: PdfBlock[],
  images: NonNullable<PdfSectionTemplate["images"]>,
) {
  if (!images.length) return blocks
  const buckets = new Map<number, PdfBlock[]>()
  const blockCount = blocks.length
  const ordered = [...images].sort((left, right) =>
    (left.flowRatio ?? 1) - (right.flowRatio ?? 1)
    || (left.sourcePage ?? 0) - (right.sourcePage ?? 0)
    || (left.sourceYRatio ?? 0) - (right.sourceYRatio ?? 0)
    || (left.sourceOrder ?? 0) - (right.sourceOrder ?? 0),
  )
  for (const image of ordered) {
    const ratio = Math.max(0, Math.min(1, image.flowRatio ?? 1))
    const index = blockCount ? Math.max(0, Math.min(blockCount, Math.round(ratio * blockCount))) : 0
    const bucket = buckets.get(index) ?? []
    bucket.push(imageTemplateBlock(image))
    buckets.set(index, bucket)
  }

  const output: PdfBlock[] = []
  for (let index = 0; index <= blockCount; index += 1) {
    output.push(...(buckets.get(index) ?? []))
    if (index < blockCount) output.push(blocks[index])
  }
  return output
}

function dataUrlFromBlob(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener("load", () => resolve(String(reader.result)), { once: true })
    reader.addEventListener("error", () => reject(new Error("Unable to read an image for the PDF.")), { once: true })
    reader.readAsDataURL(blob)
  })
}

function decodeImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = "async"
    image.addEventListener("load", () => resolve(image), { once: true })
    image.addEventListener("error", () => reject(new Error("Unable to decode an image for the PDF.")), { once: true })
    image.src = dataUrl
  })
}

async function normalizeImage(dataUrl: string, isPng = false): Promise<LoadedImage> {
  const image = await decodeImage(dataUrl)
  const maxDimension = 1800
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth || 1, image.naturalHeight || 1))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round((image.naturalWidth || 1) * scale))
  canvas.height = Math.max(1, Math.round((image.naturalHeight || 1) * scale))
  const context = canvas.getContext("2d", { alpha: isPng })
  if (!context) throw new Error("Unable to prepare an image for the PDF.")
  if (!isPng) {
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return {
    dataUrl: isPng ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.84),
    width: canvas.width,
    height: canvas.height,
  }
}

function loadImage(src: string) {
  const cached = imageCache.get(src)
  if (cached) return cached
  const isPng = src.toLowerCase().endsWith(".png") || src.startsWith("data:image/png")
  const promise = (async () => {
    try {
      const rawDataUrl = src.startsWith("data:")
        ? src
        : await fetch(src, { cache: "no-store", credentials: "same-origin" }).then(async (response) => {
            if (!response.ok) throw new Error(`Image request failed with status ${response.status}.`)
            return dataUrlFromBlob(await response.blob())
          })
      return await normalizeImage(rawDataUrl, isPng)
    } catch {
      return null
    }
  })()
  imageCache.set(src, promise)
  return promise
}

function setLanguage(doc: JsPdfDocument, rtl: boolean, fontSize = 10, bold = false) {
  // Never enable jsPDF's global R2L character reversal. Arabic is shaped by
  // the Arabic parser and reordered by the BiDi text options per text run.
  doc.setR2L?.(false)
  doc.setLanguage?.(rtl ? "ar-SA" : "en-GB")
  doc.setFont(rtl ? ARABIC_FONT_FAMILY : "helvetica", rtl ? "normal" : bold ? "bold" : "normal")
  doc.setFontSize(fontSize)
  doc.setCharSpace?.(0)
}

function shapeArabicText(doc: JsPdfDocument, text: string | string[]) {
  const shape = (value: string) => String(doc.processArabic(value.normalize("NFC")))
  return Array.isArray(text) ? text.map(shape) : shape(text)
}

function writePdfText(
  doc: JsPdfDocument,
  text: string | string[],
  x: number,
  y: number,
  options: Record<string, unknown> = {},
  rtl = false,
) {
  const preparedText = rtl ? shapeArabicText(doc, text) : text
  doc.text(preparedText, x, y, rtl ? { ...options, ...ARABIC_TEXT_OPTIONS } : options)
}

function textLines(doc: JsPdfDocument, text: string, width: number) {
  const normalized = normalizeText(text) || "—"
  const split = doc.splitTextToSize(normalized, Math.max(8, width))
  return Array.isArray(split) ? split : [String(split)]
}

function drawContinuationHeader(flow: Flow) {
  const { doc, template, pageWidth, rtl, logoImage } = flow
  doc.setFillColor(29, 78, 216)
  doc.rect(0, 0, pageWidth, 3, "F")

  if (logoImage) {
    const maxHeight = 5.5
    const maxW = 28
    const ratio = Math.min(maxW / logoImage.width, maxHeight / logoImage.height)
    const w = logoImage.width * ratio
    const h = logoImage.height * ratio
    const logoX = rtl ? pageWidth - PAGE.margin - w : PAGE.margin
    doc.addImage(logoImage.dataUrl, "PNG", logoX, 4.5, w, h, undefined, "FAST")
  } else {
    setLanguage(doc, rtl, 8, true)
    doc.setTextColor(15, 23, 42)
    writePdfText(doc, template.projectName, rtl ? pageWidth - PAGE.margin : PAGE.margin, 8.5, { align: rtl ? "right" : "left" }, rtl)
  }

  setLanguage(doc, rtl, 8, false)
  doc.setTextColor(100, 116, 139)
  writePdfText(
    doc,
    `${template.termName || template.title} · ${template.reportNumber}`,
    rtl ? PAGE.margin : pageWidth - PAGE.margin,
    8.5,
    { align: rtl ? "left" : "right" },
    rtl,
  )

  doc.setDrawColor(226, 232, 240)
  doc.line(PAGE.margin, 12, pageWidth - PAGE.margin, 12)
  flow.y = 16
}

function addFlowPage(flow: Flow) {
  flow.doc.addPage("a4", "portrait")
  flow.pageNumber += 1
  drawContinuationHeader(flow)
}

function ensureSpace(flow: Flow, required: number) {
  if (flow.y + required <= flow.bottom) return
  addFlowPage(flow)
}

function drawMetaCell(flow: Flow, x: number, y: number, width: number, label: string, value: string) {
  const { doc, rtl } = flow
  doc.setDrawColor(226, 232, 240)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(x, y, width, 14, 1, 1, "FD")
  setLanguage(doc, rtl, 6.5, true)
  doc.setTextColor(100, 116, 139)
  writePdfText(doc, label, rtl ? x + width - 3 : x + 3, y + 4.2, { align: rtl ? "right" : "left" }, rtl)
  setLanguage(doc, rtl, 8.5, false)
  doc.setTextColor(15, 23, 42)
  const lines = textLines(doc, value, width - 6).slice(0, 2)
  writePdfText(
    doc,
    lines,
    rtl ? x + width - 3 : x + 3,
    y + 8.5,
    { align: rtl ? "right" : "left", lineHeightFactor: 1.1 },
    rtl,
  )
}

function drawFirstPageHeader(flow: Flow) {
  const { doc, template, pageWidth, rtl, logoImage } = flow

  // 1. Top accent line (Navy)
  doc.setFillColor(30, 58, 138)
  doc.rect(0, 0, pageWidth, 2.5, "F")

  // 2. Header bar with LogoB.png logo
  if (logoImage) {
    const maxHeight = 9
    const maxW = 40
    const ratio = Math.min(maxW / logoImage.width, maxHeight / logoImage.height)
    const w = logoImage.width * ratio
    const h = logoImage.height * ratio
    const logoX = rtl ? pageWidth - PAGE.margin - w : PAGE.margin
    doc.addImage(logoImage.dataUrl, "PNG", logoX, 5.5, w, h, undefined, "FAST")
  } else {
    setLanguage(doc, rtl, 9.5, true)
    doc.setTextColor(30, 58, 138)
    writePdfText(
      doc,
      rtl ? "روية للاستشارات" : "PROVISION CONSULTANCY",
      rtl ? pageWidth - PAGE.margin : PAGE.margin,
      10.5,
      { align: rtl ? "right" : "left" },
      rtl,
    )
  }

  // Header right side text (Platform Name)
  setLanguage(doc, rtl, 7.5, true)
  doc.setTextColor(100, 116, 139)
  writePdfText(
    doc,
    rtl ? "منصة إشراف الإنشاءات" : "CONSTRUCTION SUPERVISION PLATFORM",
    rtl ? PAGE.margin : pageWidth - PAGE.margin,
    10.5,
    { align: rtl ? "left" : "right" },
    rtl,
  )

  // Separator line under header logo
  doc.setDrawColor(226, 232, 240)
  doc.line(PAGE.margin, 17, pageWidth - PAGE.margin, 17)

  // Main Title: Report / Term Name
  const reportMainTitle = template.termName || template.title
  setLanguage(doc, rtl, 16, true)
  doc.setTextColor(15, 23, 42)
  writePdfText(
    doc,
    reportMainTitle,
    rtl ? pageWidth - PAGE.margin : PAGE.margin,
    24.5,
    { align: rtl ? "right" : "left" },
    rtl,
  )

  // Subtitle: Project Name · Report Number
  setLanguage(doc, rtl, 9, false)
  doc.setTextColor(71, 85, 105)
  const subtitle = `${template.projectName} · ${template.reportNumber}`
  writePdfText(
    doc,
    subtitle,
    rtl ? pageWidth - PAGE.margin : PAGE.margin,
    30,
    { align: rtl ? "right" : "left" },
    rtl,
  )

  // Metadata Grid (8 boxes)
  const labels = rtl
    ? ["المشروع", "مرجع المشروع", "المرحلة", "البند", "رقم المستند", "رقم الزيارة", "النوع", "الموضوع"]
    : ["Project", "Project Reference", "Stage", "Term", "Document Number", "Visit Number", "Type", "Subject"]
  const values = [
    template.projectName,
    template.projectReference,
    template.stageName,
    template.termName,
    template.reportNumber,
    template.visitNumber,
    template.reportType,
    template.subject,
  ]
  const gap = 2.5
  const cellWidth = (pageWidth - PAGE.margin * 2 - gap * 3) / 4
  for (let index = 0; index < values.length; index += 1) {
    const row = Math.floor(index / 4)
    const logicalColumn = index % 4
    const physicalColumn = rtl ? 3 - logicalColumn : logicalColumn
    drawMetaCell(
      flow,
      PAGE.margin + physicalColumn * (cellWidth + gap),
      34 + row * 15,
      cellWidth,
      labels[index],
      values[index],
    )
  }
  flow.y = 68
}

function renderHeading(flow: Flow, block: Extract<PdfBlock, { type: "heading" }>) {
  const size = block.level <= 2 ? 14 : block.level === 3 ? 12 : 10.5
  setLanguage(flow.doc, flow.rtl, size, true)
  const lines = textLines(flow.doc, block.text, flow.width)
  const height = lines.length * (size * 0.42 + 1.4) + 3
  ensureSpace(flow, height)
  flow.doc.setTextColor(15, 23, 42)
  writePdfText(flow.doc, lines, flow.rtl ? flow.x + flow.width : flow.x, flow.y, {
    align: flow.rtl ? "right" : "left",
    lineHeightFactor: 1.25,
  }, flow.rtl)
  flow.y += height
}

function renderParagraph(flow: Flow, text: string, options: { indent?: number; bullet?: string } = {}) {
  setLanguage(flow.doc, flow.rtl, 10, false)
  const indent = options.indent ?? 0
  const bulletWidth = options.bullet ? 6 : 0
  const available = flow.width - indent - bulletWidth
  const lines = textLines(flow.doc, text, available)
  const lineHeight = 5.1
  const height = Math.max(lineHeight, lines.length * lineHeight) + 2
  ensureSpace(flow, height)
  flow.doc.setTextColor(51, 65, 85)
  if (options.bullet) {
    const bulletX = flow.rtl ? flow.x + flow.width - indent : flow.x + indent
    const bulletRtl = flow.rtl && containsArabic(options.bullet)
    setLanguage(flow.doc, bulletRtl, 10, false)
    writePdfText(
      flow.doc,
      options.bullet,
      bulletX,
      flow.y,
      { align: flow.rtl ? "right" : "left" },
      bulletRtl,
    )
    setLanguage(flow.doc, flow.rtl, 10, false)
  }
  const textX = flow.rtl
    ? flow.x + flow.width - indent - bulletWidth
    : flow.x + indent + bulletWidth
  writePdfText(
    flow.doc,
    lines,
    textX,
    flow.y,
    { align: flow.rtl ? "right" : "left", lineHeightFactor: 1.25 },
    flow.rtl,
  )
  flow.y += height
}

function isNumericCell(value: string) {
  // Arabic-Indic digits must continue using the embedded Arabic font.
  return /^[\s\d.,:;+/\-–—()%#]+$/.test(value)
}

function calculateTableColumnWidths(headers: string[], rows: string[][], totalWidth: number) {
  const count = Math.max(headers.length, ...rows.map((row) => row.length), 1)
  const lengths = Array.from({ length: count }, (_, index) => {
    const values = [headers[index] || "", ...rows.map((row) => row[index] || "")]
    return Math.max(4, ...values.map((value) => normalizeText(value).length))
  })
  const weights = lengths.map((length, index) => {
    const values = [headers[index] || "", ...rows.map((row) => row[index] || "")]
    const numeric = values.every((value) => !normalizeText(value) || isNumericCell(normalizeText(value)))
    return numeric ? 0.72 : Math.min(3.4, Math.max(1, Math.sqrt(Math.min(length, 120) / 12)))
  })
  const totalWeight = weights.reduce((sum, value) => sum + value, 0)
  const minimum = Math.min(20, totalWidth / count)
  let widths = weights.map((weight) => Math.max(minimum, totalWidth * weight / totalWeight))
  const widthSum = widths.reduce((sum, value) => sum + value, 0)
  widths = widths.map((width) => width * totalWidth / widthSum)
  return widths
}

function tableCellLines(doc: JsPdfDocument, value: string, width: number) {
  return textLines(doc, value || "—", Math.max(8, width - 4))
}

function drawRtlTableCells(input: {
  flow: Flow
  sourceIndexes: number[]
  widths: number[]
  cells: string[][]
  y: number
  height: number
  fill: [number, number, number] | null
  textColor: [number, number, number]
  fontSize: number
}) {
  const { flow, sourceIndexes, widths, cells, y, height, fill, textColor, fontSize } = input
  let x = flow.x
  for (let physicalIndex = 0; physicalIndex < sourceIndexes.length; physicalIndex += 1) {
    const sourceIndex = sourceIndexes[physicalIndex]
    const width = widths[sourceIndex]
    flow.doc.setDrawColor(148, 163, 184)
    if (fill) {
      flow.doc.setFillColor(...fill)
      flow.doc.rect(x, y, width, height, "FD")
    } else {
      flow.doc.rect(x, y, width, height)
    }

    const logicalValue = cells[sourceIndex]?.join("\n") || "—"
    const numeric = isNumericCell(logicalValue)
    setLanguage(flow.doc, !numeric, fontSize, false)
    flow.doc.setTextColor(...textColor)
    const lines = cells[sourceIndex]?.length ? cells[sourceIndex] : ["—"]
    writePdfText(
      flow.doc,
      lines,
      numeric ? x + width / 2 : x + width - 2,
      y + 4.3,
      {
        align: numeric ? "center" : "right",
        lineHeightFactor: 1.2,
      },
      !numeric,
    )
    x += width
  }
}

function renderRtlTable(flow: Flow, block: Extract<PdfBlock, { type: "table" }>) {
  const rows = block.rows.length ? block.rows : []
  if (!block.headers.length && !rows.length) return

  const columnCount = Math.max(block.headers.length, ...rows.map((row) => row.length), 1)
  const headers = Array.from({ length: columnCount }, (_, index) => block.headers[index] || "")
  const normalizedRows = rows.map((row) => Array.from({ length: columnCount }, (_, index) => row[index] || ""))
  const widths = calculateTableColumnWidths(headers, normalizedRows, flow.width)
  // Physical drawing is left-to-right, therefore reverse source columns so
  // the first logical Arabic column is the rightmost column in the PDF.
  const sourceIndexes = Array.from({ length: columnCount }, (_, index) => columnCount - index - 1)
  const lineHeight = 4.15
  const hasHeader = block.headers.length > 0
  const headerLines = headers.map((value, index) => tableCellLines(flow.doc, value, widths[index]))
  const headerHeight = hasHeader
    ? Math.max(9, Math.max(...headerLines.map((lines) => lines.length)) * lineHeight + 4)
    : 0

  const drawHeader = () => {
    if (!hasHeader) return
    ensureSpace(flow, headerHeight + 1)
    drawRtlTableCells({
      flow,
      sourceIndexes,
      widths,
      cells: headerLines,
      y: flow.y,
      height: headerHeight,
      fill: [226, 232, 240],
      textColor: [15, 23, 42],
      fontSize: 8.5,
    })
    flow.y += headerHeight
  }

  drawHeader()

  for (const row of normalizedRows) {
    let remaining = row.map((value, index) => tableCellLines(flow.doc, value, widths[index]))
    let continued = false

    while (remaining.some((lines) => lines.length > 0)) {
      const availableHeight = flow.bottom - flow.y
      const availableLines = Math.floor((availableHeight - 4) / lineHeight)
      if (availableLines < 1) {
        addFlowPage(flow)
        drawHeader()
        continue
      }

      const maximumLines = Math.max(...remaining.map((lines) => lines.length))
      const chunkLineCount = Math.max(1, Math.min(maximumLines, availableLines))
      const chunk = remaining.map((lines) => lines.slice(0, chunkLineCount))
      remaining = remaining.map((lines) => lines.slice(chunkLineCount))
      const rowHeight = Math.max(9, Math.max(...chunk.map((lines) => Math.max(1, lines.length))) * lineHeight + 4)

      drawRtlTableCells({
        flow,
        sourceIndexes,
        widths,
        cells: chunk,
        y: flow.y,
        height: rowHeight,
        fill: continued ? [248, 250, 252] : null,
        textColor: [51, 65, 85],
        fontSize: 8.5,
      })
      flow.y += rowHeight
      continued = remaining.some((lines) => lines.length > 0)
      if (continued) {
        addFlowPage(flow)
        drawHeader()
      }
    }
  }
  flow.y += 5
}

function renderTable(flow: Flow, block: Extract<PdfBlock, { type: "table" }>) {
  const rows = block.rows.length ? block.rows : []
  if (!block.headers.length && !rows.length) return
  if (flow.rtl) {
    renderRtlTable(flow, block)
    return
  }
  ensureSpace(flow, 18)
  setLanguage(flow.doc, flow.rtl, 8.5, false)
  const options: Record<string, unknown> = {
    startY: flow.y,
    head: block.headers.length ? [block.headers] : [],
    body: rows,
    theme: "grid",
    tableWidth: flow.width,
    margin: { top: 17, left: flow.x, right: flow.pageWidth - flow.x - flow.width, bottom: PAGE.footer + 5 },
    styles: {
      font: flow.rtl ? ARABIC_FONT_FAMILY : "helvetica",
      fontStyle: "normal",
      fontSize: 8.5,
      textColor: [51, 65, 85],
      lineColor: [148, 163, 184],
      lineWidth: 0.2,
      cellPadding: 2,
      halign: flow.rtl ? "right" : "left",
      valign: "top",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [226, 232, 240],
      textColor: [15, 23, 42],
      font: flow.rtl ? ARABIC_FONT_FAMILY : "helvetica",
      fontStyle: "normal",
      halign: flow.rtl ? "right" : "left",
    },
    didDrawPage: () => {
      const currentPage = flow.doc.internal.getCurrentPageInfo?.().pageNumber ?? flow.doc.internal.getNumberOfPages()
      if (currentPage > flow.pageNumber) {
        flow.pageNumber = currentPage
        drawContinuationHeader(flow)
      }
    },
  }
  flow.doc.autoTable(options)
  const finalY = Number(flow.doc.lastAutoTable?.finalY ?? flow.y + 12)
  flow.pageNumber = flow.doc.internal.getNumberOfPages()
  flow.y = finalY + 5
  if (flow.y > flow.bottom) addFlowPage(flow)
}

async function renderImageBlock(flow: Flow, block: Extract<PdfBlock, { type: "image" }>, preferredWidth?: number) {
  const image = await loadImage(block.src)
  if (!image) {
    renderParagraph(flow, block.caption || (flow.rtl ? "تعذر تحميل الصورة." : "Image unavailable."))
    return
  }
  const widthFromRatio = block.preferredWidthRatio ? flow.width * Math.max(0.2, Math.min(1, block.preferredWidthRatio)) : undefined
  const maxWidth = Math.min(flow.width, preferredWidth ?? widthFromRatio ?? flow.width)
  const heightFromRatio = block.preferredHeightRatio
    ? Math.max(20, Math.min(230, (flow.bottom - 18) * block.preferredHeightRatio))
    : undefined
  const maxHeight = Math.min(230, heightFromRatio ?? 115)
  const ratio = Math.min(maxWidth / image.width, maxHeight / image.height)
  const width = image.width * ratio
  const height = image.height * ratio
  const captionHeight = block.caption ? 7 : 0
  ensureSpace(flow, height + captionHeight + 4)
  const alignment = block.alignment ?? (flow.rtl ? "right" : "left")
  const x = alignment === "center"
    ? flow.x + (flow.width - width) / 2
    : alignment === "right"
      ? flow.x + flow.width - width
      : flow.x
  flow.doc.setDrawColor(203, 213, 225)
  flow.doc.rect(x - 0.5, flow.y - 0.5, width + 1, height + 1)
  flow.doc.addImage(image.dataUrl, "JPEG", x, flow.y, width, height, undefined, "FAST")
  flow.y += height + 2
  if (block.caption) {
    setLanguage(flow.doc, flow.rtl, 7.5, false)
    flow.doc.setTextColor(100, 116, 139)
    writePdfText(flow.doc, textLines(flow.doc, block.caption, width), flow.rtl ? x + width : x, flow.y, {
      align: flow.rtl ? "right" : "left",
      lineHeightFactor: 1.1,
    }, flow.rtl)
    flow.y += captionHeight
  }
  flow.y += 3
}

async function renderBlocks(flow: Flow, blocks: PdfBlock[]) {
  for (const block of blocks) {
    if (block.type === "heading") renderHeading(flow, block)
    else if (block.type === "paragraph") renderParagraph(flow, block.text)
    else if (block.type === "list") {
      for (let index = 0; index < block.items.length; index += 1) {
        renderParagraph(flow, block.items[index], { indent: 2, bullet: block.ordered ? `${index + 1}.` : "•" })
      }
    } else if (block.type === "table") renderTable(flow, block)
    else if (block.type === "image") await renderImageBlock(flow, block)
    else if (block.type === "spacer") flow.y += block.height
  }
}

function renderSectionTitle(flow: Flow, title: string) {
  ensureSpace(flow, 24)
  setLanguage(flow.doc, flow.rtl, 11.5, true)
  flow.doc.setTextColor(15, 23, 42)

  // Accent pill bar next to section title
  const barWidth = 1.5
  const barHeight = 4.2
  const barX = flow.rtl ? flow.x + flow.width - barWidth : flow.x
  flow.doc.setFillColor(37, 99, 235)
  flow.doc.rect(barX, flow.y - 3.2, barWidth, barHeight, "F")

  const textX = flow.rtl ? flow.x + flow.width - 3.5 : flow.x + 3.5
  writePdfText(
    flow.doc,
    title,
    textX,
    flow.y,
    { align: flow.rtl ? "right" : "left" },
    flow.rtl,
  )

  flow.doc.setDrawColor(241, 245, 249)
  flow.doc.line(flow.x, flow.y + 2.5, flow.x + flow.width, flow.y + 2.5)
  flow.y += 8.5
}

async function renderImageGrid(flow: Flow, images: NonNullable<PdfSectionTemplate["images"]>, sourceVisuals: boolean) {
  if (!images.length) {
    renderParagraph(flow, flow.rtl ? "لا توجد صور." : "No images recorded.")
    return
  }
  for (const image of images) {
    await renderImageBlock(flow, { type: "image", ...image }, sourceVisuals ? flow.width : undefined)
  }
}


type SourceLayoutContentBlock = Extract<PdfBlock, { type: "heading" | "paragraph" | "table" }>

type SourceLayoutItem =
  | { kind: "content"; top: number; left: number; width: number; source: ExtractedPdfLayoutBlock }
  | { kind: "image"; top: number; left: number; width: number; source: ExtractedPdfImage }
  | { kind: "fallback"; top: number; left: number; width: number; src: string; pageNumber: number }

function translatedSourceBlocks(html: string) {
  const result: SourceLayoutContentBlock[] = []
  for (const block of htmlToBlocks(html)) {
    if (block.type === "heading" || block.type === "paragraph" || block.type === "table") {
      result.push(block)
    } else if (block.type === "list") {
      for (let index = 0; index < block.items.length; index += 1) {
        result.push({
          type: "paragraph",
          text: `${block.ordered ? `${index + 1}.` : "•"} ${block.items[index]}`,
        })
      }
    }
  }
  return result
}

function sourceBlockQueues(html: string) {
  const queues = {
    heading: [] as Array<Extract<PdfBlock, { type: "heading" }>>,
    paragraph: [] as Array<Extract<PdfBlock, { type: "paragraph" }>>,
    table: [] as Array<Extract<PdfBlock, { type: "table" }>>,
  }
  for (const block of translatedSourceBlocks(html)) queues[block.type].push(block as any)
  const indexes = { heading: 0, paragraph: 0, table: 0 }
  return {
    take(source: ExtractedPdfLayoutBlock): SourceLayoutContentBlock | null {
      const type = source.type
      const queue = queues[type]
      const index = indexes[type]
      indexes[type] += 1
      return queue[index] ?? null
    },
  }
}

function sourceBlockToPdfBlock(source: ExtractedPdfLayoutBlock): SourceLayoutContentBlock {
  if (source.type === "table") {
    return {
      type: "table",
      headers: source.headers ?? [],
      rows: source.rows ?? [],
    }
  }
  if (source.type === "heading") {
    return { type: "heading", level: source.level ?? 3, text: source.text }
  }
  return { type: "paragraph", text: source.text }
}

function sourceLayoutItems(page: NonNullable<LanguagePdfTemplate["sourceLayout"]>["pages"][number]) {
  const contentItems: SourceLayoutItem[] = (page.layoutBlocks ?? []).map((block) => ({
    kind: "content",
    top: block.yRatio,
    left: block.xRatio,
    width: block.widthRatio,
    source: block,
  }))
  const imageItems: SourceLayoutItem[] = (page.images ?? [])
    .filter((image) => image.decorative !== true)
    .map((image) => ({
      kind: "image",
      top: image.yRatio,
      left: image.xRatio,
      width: image.widthRatio,
      source: image,
    }))
  const fallback: SourceLayoutItem[] = page.imageDataUrl && page.imageExtractionComplete === false
    ? [{ kind: "fallback", top: 1.02, left: 0, width: 1, src: page.imageDataUrl, pageNumber: page.pageNumber }]
    : []
  return [...contentItems, ...imageItems, ...fallback].sort((left, right) =>
    left.top - right.top || left.left - right.left || (left.kind === "image" ? 1 : -1),
  )
}

function captionLinesFromHtml(html: string) {
  const explicit = Array.from(html.matchAll(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/gi))
    .map((match) => normalizeText(match[1].replace(/<[^>]+>/g, " ")))
    .filter(Boolean)
  const patterned = htmlToBlocks(html)
    .flatMap((block) => block.type === "paragraph" || block.type === "heading" ? [block.text] : [])
    .filter((line) => /^(?:figure|fig\.?|photo|image|plate|photograph|الشكل|شكل|الصورة|صورة|اللقطة|لقطة)\b/i.test(line))
  return [...explicit, ...patterned].filter((value, index, values) => values.indexOf(value) === index)
}

function drawPreservedSourcePageHeader(flow: Flow, sourcePage: number, totalPages: number) {
  const { doc, template, rtl, pageWidth } = flow
  doc.setFillColor(29, 78, 216)
  doc.rect(0, 0, pageWidth, 3, "F")
  setLanguage(doc, rtl, 9.5, true)
  doc.setTextColor(15, 23, 42)
  writePdfText(doc, template.projectName, rtl ? pageWidth - PAGE.margin : PAGE.margin, 10, {
    align: rtl ? "right" : "left",
  }, rtl)
  const pageLabel = rtl
    ? `صفحة المصدر ${sourcePage} من ${totalPages}`
    : `Source page ${sourcePage} of ${totalPages}`
  setLanguage(doc, rtl, 8, false)
  doc.setTextColor(100, 116, 139)
  writePdfText(doc, `${template.reportNumber} · ${pageLabel}`, rtl ? PAGE.margin : pageWidth - PAGE.margin, 10, {
    align: rtl ? "left" : "right",
  }, rtl)
  doc.setDrawColor(203, 213, 225)
  doc.line(PAGE.margin, 14, pageWidth - PAGE.margin, 14)
  flow.x = PAGE.margin
  flow.width = pageWidth - PAGE.margin * 2
  flow.y = 18
  flow.bottom = flow.pageHeight - PAGE.footer - 5
}

function positionedSubFlow(flow: Flow, leftRatio: number, widthRatio: number, desiredY: number, minimumWidth = 45) {
  const availableWidth = flow.pageWidth - PAGE.margin * 2
  const width = Math.max(minimumWidth, Math.min(availableWidth, availableWidth * Math.max(0.08, widthRatio)))
  const maximumX = flow.pageWidth - PAGE.margin - width
  const x = Math.max(PAGE.margin, Math.min(maximumX, PAGE.margin + availableWidth * Math.max(0, leftRatio)))
  return { ...flow, x, width, y: Math.max(flow.y, desiredY) }
}

async function renderPreservedSourceLayout(flow: Flow, layout: NonNullable<LanguagePdfTemplate["sourceLayout"]>) {
  const translatedQueues = flow.rtl ? sourceBlockQueues(layout.contentHtml) : null
  const translatedCaptions = flow.rtl ? captionLinesFromHtml(layout.contentHtml) : []
  let imageCaptionIndex = 0
  const pageTop = 18
  const pageContentHeight = flow.pageHeight - pageTop - PAGE.footer - 5

  for (let pageIndex = 0; pageIndex < layout.pages.length; pageIndex += 1) {
    if (pageIndex > 0) {
      flow.doc.addPage("a4", "portrait")
      flow.pageNumber += 1
    }
    const page = layout.pages[pageIndex]
    drawPreservedSourcePageHeader(flow, page.pageNumber, layout.pages.length)

    const rows: SourceLayoutItem[][] = []
    for (const item of sourceLayoutItems(page)) {
      const previous = rows[rows.length - 1]
      if (previous && Math.abs(previous[0].top - item.top) <= 0.022) previous.push(item)
      else rows.push([item])
    }

    for (const row of rows) {
      const desiredY = pageTop + Math.min(0.98, Math.max(0, row[0].top)) * pageContentHeight
      const rowY = Math.max(flow.y, desiredY)
      let rowBottom = rowY

      for (const item of row) {
        if (item.kind === "content") {
          const sourceBlock = sourceBlockToPdfBlock(item.source)
          const block = translatedQueues?.take(item.source) ?? sourceBlock
          const minimumWidth = block.type === "table" ? 85 : 45
          const subFlow = positionedSubFlow({ ...flow, y: rowY }, item.left, item.width, rowY, minimumWidth)
          if (block.type === "heading") renderHeading(subFlow, block)
          else if (block.type === "paragraph") renderParagraph(subFlow, block.text)
          else renderTable(subFlow, block)
          flow.pageNumber = Math.max(flow.pageNumber, subFlow.pageNumber)
          rowBottom = Math.max(rowBottom, subFlow.y)
          continue
        }

        if (item.kind === "image") {
          const source = item.source
          const caption = flow.rtl
            ? translatedCaptions[imageCaptionIndex] || `صورة من الصفحة ${source.pageNumber} · رقم ${source.order}`
            : source.sourceCaption || `Source page ${source.pageNumber} · Image ${source.order}`
          imageCaptionIndex += 1
          const subFlow = positionedSubFlow({ ...flow, y: rowY }, item.left, item.width, rowY, 12)
          await renderImageBlock(subFlow, {
            type: "image",
            src: source.dataUrl,
            caption,
            preferredWidthRatio: 1,
            preferredHeightRatio: source.heightRatio,
            alignment: source.xRatio + source.widthRatio / 2 < 0.4
              ? "left"
              : source.xRatio + source.widthRatio / 2 > 0.6
                ? "right"
                : "center",
          }, subFlow.width)
          flow.pageNumber = Math.max(flow.pageNumber, subFlow.pageNumber)
          rowBottom = Math.max(rowBottom, subFlow.y)
          continue
        }

        // Loss-resistant fallback for rare PDF image operators that PDF.js cannot
        // decode individually. It stays adjacent to its source page instead of
        // being collected into a document-end image appendix.
        const subFlow = positionedSubFlow({ ...flow, y: rowY }, 0, 1, rowY, 120)
        await renderImageBlock(subFlow, {
          type: "image",
          src: item.src,
          caption: flow.rtl
            ? `نسخة مرئية احتياطية للصفحة ${item.pageNumber} للحفاظ على جميع عناصر الإثبات.`
            : `Visual fallback for source page ${item.pageNumber}, preserving undecodable evidence.`,
          preferredWidthRatio: 1,
          preferredHeightRatio: 0.9,
          alignment: "center",
        }, subFlow.width)
        flow.pageNumber = Math.max(flow.pageNumber, subFlow.pageNumber)
        rowBottom = Math.max(rowBottom, subFlow.y)
      }

      flow.y = Math.max(flow.y, rowBottom + 1.5)
    }
  }
}

function addPageNumbers(doc: JsPdfDocument, rtl: boolean) {
  const pages = doc.internal.getNumberOfPages()
  const width = doc.internal.pageSize.getWidth()
  const height = doc.internal.pageSize.getHeight()
  const margin = PAGE.margin
  const org = getOrganizationProfile()

  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    doc.setDrawColor(226, 232, 240)
    doc.line(margin, height - 12, width - margin, height - 12)

    // Left info (Phones, Website, Email)
    const leftText = [
      org.phones ? `Tel: ${org.phones}` : "",
      [org.website, org.email].filter(Boolean).join(" · "),
    ].filter(Boolean)

    if (leftText.length) {
      setLanguage(doc, false, 6.8, false)
      doc.setTextColor(100, 116, 139)
      writePdfText(
        doc,
        leftText,
        rtl ? width - margin : margin,
        height - 8.5,
        { align: rtl ? "right" : "left", lineHeightFactor: 1.15 },
        false,
      )
    }

    // Right info (C.R. No, P.O. Box, Postal Code, Address)
    const arReg = `س.ت: ${org.crNumber} | ص.ب: ${org.poBox} | ر.ب: ${org.postalCode} | ${org.addressAr}`
    const enReg = `C.R. No.: ${org.crNumber}, P.O. Box: ${org.poBox}, Postal Code: ${org.postalCode} · ${org.addressEn}`
    const rightText = [rtl ? arReg : enReg]

    setLanguage(doc, rtl, 6.8, false)
    doc.setTextColor(100, 116, 139)
    writePdfText(
      doc,
      rightText,
      rtl ? margin : width - margin,
      height - 8.5,
      { align: rtl ? "left" : "right", lineHeightFactor: 1.15 },
      rtl,
    )

    // Page Number
    setLanguage(doc, false, 7, false)
    doc.setTextColor(148, 163, 184)
    doc.text(`${page} / ${pages}`, width / 2, height - 3, { align: "center" })
  }
  if (rtl) setLanguage(doc, true, 8, false)
}

function countHtmlTables(html: string | undefined) {
  return html ? (html.match(/<table\b/gi) ?? []).length : 0
}

function textLengthFromHtml(html: string | undefined) {
  return html ? normalizeText(html.replace(/<[^>]+>/g, " ")).length : 0
}

function templateInventory(template: LanguagePdfTemplate) {
  return template.sections.reduce((inventory, section) => {
    inventory.tables += section.table ? 1 : 0
    inventory.tables += countHtmlTables(section.html) + countHtmlTables(section.documentsHtml)
    inventory.images += section.images?.length ?? 0
    inventory.text += section.title.length
    inventory.text += textLengthFromHtml(section.html) + textLengthFromHtml(section.documentsHtml)
    inventory.text += section.table?.rows.flat().join(" ").length ?? 0
    return inventory
  }, { sections: template.sections.length, tables: 0, images: 0, text: 0 })
}

function expectedSourceImageCount(sourceDocument: ExtractedSourceDocument | null) {
  if (!sourceDocument) return 0
  const extracted = sourceDocument.pages
    .flatMap((page) => page.images ?? [])
    .filter((image) => image.decorative !== true).length
  const fallbackPages = sourceDocument.pages.filter((page) => page.imageDataUrl && page.imageExtractionComplete === false).length
  return extracted + fallbackPages
}

function validateTemplateAssets(template: LanguagePdfTemplate, sourceDocument: ExtractedSourceDocument | null) {
  const inventory = templateInventory(template)
  if (inventory.text < 20) throw new Error("The PDF report model contains no meaningful text content.")
  const expectedImages = expectedSourceImageCount(sourceDocument)
  if (expectedImages > 0 && inventory.images < expectedImages) {
    throw new Error(`The PDF report model is missing source images (${inventory.images}/${expectedImages}).`)
  }
  const misplacedSourceImages = template.sections
    .flatMap((section) => section.images ?? [])
    .filter((image) => image.sourcePage !== undefined && image.flowTarget === "gallery")
  if (misplacedSourceImages.length) {
    throw new Error("Source PDF images must remain in document flow and cannot be rendered as an appendix gallery.")
  }
}

function imageFlowSignature(template: LanguagePdfTemplate) {
  return template.sections.flatMap((section) => (section.images ?? [])
    .filter((image) => image.sourcePage !== undefined)
    .map((image) => [
      section.key,
      image.flowTarget ?? "gallery",
      image.sourcePage ?? 0,
      image.sourceOrder ?? 0,
      Math.round((image.flowRatio ?? 1) * 10_000),
    ].join(":")))
}

function validateMirroredTemplates(english: LanguagePdfTemplate, arabic: LanguagePdfTemplate) {
  const englishKeys = english.sections.map((section) => section.key)
  const arabicKeys = arabic.sections.map((section) => section.key)
  if (englishKeys.join("|") !== arabicKeys.join("|")) {
    throw new Error("English and Arabic PDF sections are not synchronized.")
  }
  const englishInventory = templateInventory(english)
  const arabicInventory = templateInventory(arabic)
  if (englishInventory.images !== arabicInventory.images) {
    throw new Error("English and Arabic PDF image counts are not synchronized.")
  }
  if (englishInventory.tables !== arabicInventory.tables) {
    throw new Error("English and Arabic PDF table structures are not synchronized.")
  }
  if (imageFlowSignature(english).join("|") !== imageFlowSignature(arabic).join("|")) {
    throw new Error("English and Arabic PDF image placement is not synchronized.")
  }
}

async function buildLanguagePdfBlob(template: LanguagePdfTemplate) {
  validateLanguagePdfTemplate(template)
  const [JsPdf, logoImage] = await Promise.all([
    loadPdfTools(),
    loadImage("/LogoB.png"),
  ])
  const doc = new JsPdf({
    unit: "mm",
    format: "a4",
    orientation: "portrait",
    compress: true,
    putOnlyUsedFonts: true,
  })
  if (template.language === "ar") {
    await installArabicFont(doc)
    doc.viewerPreferences?.({ Direction: "R2L", DisplayDocTitle: true })
  }
  const flow: Flow = {
    doc,
    template,
    rtl: template.direction === "rtl",
    pageWidth: PAGE.portraitWidth,
    pageHeight: PAGE.portraitHeight,
    x: PAGE.margin,
    y: 0,
    width: PAGE.portraitWidth - PAGE.margin * 2,
    bottom: PAGE.portraitHeight - PAGE.footer - 5,
    pageNumber: 1,
    logoImage,
  }
  drawFirstPageHeader(flow)
  for (const section of template.sections) {
    const sectionFlowImages = (section.images ?? []).filter((image) => image.flowTarget === "section")
    const galleryImages = (section.images ?? []).filter((image) => image.flowTarget !== "section" && image.flowTarget !== "documents")
    const contentBlocks = section.html !== undefined ? htmlToBlocks(section.html) : []
    if (section.table) contentBlocks.push({ type: "table", ...section.table })
    const flowedContent = interleaveFlowImages(contentBlocks, sectionFlowImages)

    const sourceDocumentBlocks = section.documentsTitle ? htmlToBlocks(section.sourceDocumentHtml ?? section.documentsHtml ?? "") : []
    const sourceDocumentImages = section.documentsTitle ? (section.images ?? []).filter((image) => image.flowTarget === "documents") : []
    const reconstructedSource = interleaveFlowImages(sourceDocumentBlocks, sourceDocumentImages)
    const otherDocumentBlocks = section.documentsTitle ? htmlToBlocks(section.otherDocumentsHtml ?? "") : []
    const hasDocuments = reconstructedSource.length > 0 || otherDocumentBlocks.length > 0
    const hasGalleryImages = galleryImages.length > 0

    const hasAnySectionContent = flowedContent.length > 0 || hasDocuments || hasGalleryImages

    // Completely omit empty sections from generated PDF output
    if (!hasAnySectionContent) {
      continue
    }

    renderSectionTitle(flow, section.title)

    if (flowedContent.length) {
      await renderBlocks(flow, flowedContent)
    }

    if (section.documentsTitle && hasDocuments) {
      renderHeading(flow, { type: "heading", level: 3, text: section.documentsTitle })
      if (reconstructedSource.length) await renderBlocks(flow, reconstructedSource)
      if (otherDocumentBlocks.length) await renderBlocks(flow, otherDocumentBlocks)
    }

    if (hasGalleryImages) {
      if (section.imageTitle) {
        renderHeading(flow, { type: "heading", level: 3, text: section.imageTitle })
      }
      await renderImageGrid(flow, galleryImages, section.key === "source-visuals")
    }

    flow.y += 4
  }

  addPageNumbers(doc, flow.rtl)
  doc.setProperties({
    title: template.title,
    subject: template.subject,
    author: template.projectName,
    creator: "BuildSight AI Document Translation",
  })
  return doc.output("blob") as Blob
}

async function openPdfBlob(blob: Blob) {
  const pdfjs = await loadPdfJs()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const loadingTask = pdfjs.getDocument({ data: bytes } as any)
  const documentProxy = await loadingTask.promise
  return { documentProxy, loadingTask }
}

async function renderPdfPage(documentProxy: any, pageNumber: number, targetWidth: number) {
  const page = await documentProxy.getPage(pageNumber)
  try {
    const viewportAtOne = page.getViewport({ scale: 1 })
    const scale = Math.max(0.35, targetWidth / Math.max(1, viewportAtOne.width))
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d", { alpha: false })
    if (!context) throw new Error("Unable to render a PDF page for bilingual export.")
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: context, viewport, background: "#ffffff" }).promise
    return canvas.toDataURL("image/jpeg", 0.8)
  } finally {
    page.cleanup?.()
  }
}

function drawPageImage(doc: JsPdfDocument, dataUrl: string | undefined, x: number, y: number, width: number, height: number, empty: string) {
  doc.setDrawColor(148, 163, 184)
  doc.setFillColor(255, 255, 255)
  doc.rect(x, y, width, height, "FD")
  if (!dataUrl) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.setTextColor(100, 116, 139)
    doc.text(empty, x + width / 2, y + height / 2, { align: "center" })
    return
  }
  const imageProperties = doc.getImageProperties(dataUrl)
  const ratio = Math.min((width - 4) / imageProperties.width, (height - 4) / imageProperties.height)
  const renderedWidth = imageProperties.width * ratio
  const renderedHeight = imageProperties.height * ratio
  doc.addImage(dataUrl, "JPEG", x + (width - renderedWidth) / 2, y + (height - renderedHeight) / 2, renderedWidth, renderedHeight, undefined, "FAST")
}

function drawBilingualHeader(input: {
  doc: JsPdfDocument
  data: StageTranslationPageData
  margin: number
  columnWidth: number
  gap: number
  englishLabel?: string
  arabicLabel?: string
}) {
  const { doc, data, margin, columnWidth, gap } = input
  doc.setFillColor(29, 78, 216)
  doc.rect(0, 0, PAGE.landscapeWidth, 4, "F")
  const projectNameIsArabic = containsArabic(data.project.name)
  setLanguage(doc, projectNameIsArabic, 13, true)
  doc.setTextColor(15, 23, 42)
  writePdfText(doc, data.project.name, projectNameIsArabic ? PAGE.landscapeWidth - margin : margin, 12, {
    align: projectNameIsArabic ? "right" : "left",
  }, projectNameIsArabic)
  const reportHeader = `${data.response.reportNumber} · ${data.term.name}`
  const reportHeaderIsArabic = containsArabic(reportHeader)
  setLanguage(doc, reportHeaderIsArabic, 8, false)
  doc.setTextColor(100, 116, 139)
  writePdfText(doc, reportHeader, PAGE.landscapeWidth - margin, 12, { align: "right" }, reportHeaderIsArabic)

  doc.setFillColor(226, 232, 240)
  doc.rect(margin, 15, columnWidth, 6, "F")
  doc.rect(margin + columnWidth + gap, 15, columnWidth, 6, "F")
  setLanguage(doc, false, 9, true)
  doc.setTextColor(15, 23, 42)
  doc.text(input.englishLabel || "English Original", margin + 3, 19.2)
  setLanguage(doc, true, 9, false)
  writePdfText(doc, input.arabicLabel || "الترجمة العربية", PAGE.landscapeWidth - margin - 3, 19.2, { align: "right" }, true)
}

function drawEvidenceImageInBox(
  doc: JsPdfDocument,
  image: LoadedImage,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  doc.setDrawColor(148, 163, 184)
  doc.setFillColor(255, 255, 255)
  doc.rect(x, y, width, height, "FD")
  const ratio = Math.min((width - 5) / image.width, (height - 5) / image.height)
  const renderedWidth = image.width * ratio
  const renderedHeight = image.height * ratio
  doc.addImage(
    image.dataUrl,
    "JPEG",
    x + (width - renderedWidth) / 2,
    y + (height - renderedHeight) / 2,
    renderedWidth,
    renderedHeight,
    undefined,
    "FAST",
  )
}

function drawBilingualCaption(input: {
  doc: JsPdfDocument
  text: string
  x: number
  y: number
  width: number
  rtl: boolean
}) {
  const { doc, text, x, y, width, rtl } = input
  setLanguage(doc, rtl, 8.5, false)
  doc.setTextColor(71, 85, 105)
  const lines = textLines(doc, text, width).slice(0, 4)
  writePdfText(doc, lines, rtl ? x + width : x, y, {
    align: rtl ? "right" : "left",
    lineHeightFactor: 1.2,
  }, rtl)
}

function addBilingualPageNumbers(doc: JsPdfDocument) {
  const pages = doc.internal.getNumberOfPages()
  const width = PAGE.landscapeWidth
  const height = PAGE.landscapeHeight
  const margin = PAGE.margin

  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    doc.setDrawColor(226, 232, 240)
    doc.line(margin, height - 9, width - margin, height - 9)

    setLanguage(doc, false, 7.5, false)
    doc.setTextColor(100, 116, 139)
    doc.text("Provision Consultancy · Confidential Document", margin, height - 4.5, { align: "left" })

    doc.text(`${page} / ${pages}`, width - margin, height - 4.5, { align: "right" })
  }
}

async function buildBilingualPdfBlob(input: {
  data: StageTranslationPageData
  translation: StageTranslationRecord
  englishBlob: Blob
  arabicBlob: Blob
  sourceDocument?: ExtractedSourceDocument | null
}) {
  const [JsPdf, englishSource, arabicSource] = await Promise.all([
    loadPdfTools(),
    openPdfBlob(input.englishBlob),
    openPdfBlob(input.arabicBlob),
  ])
  const doc = new JsPdf({ unit: "mm", format: "a4", orientation: "landscape", compress: true })
  await installArabicFont(doc)
  const total = Math.max(englishSource.documentProxy.numPages, arabicSource.documentProxy.numPages, 1)
  const renderWidth = total > 30 ? 700 : 850
  const margin = 9
  const gap = 6
  const top = 22
  const bottom = 12
  const columnWidth = (PAGE.landscapeWidth - margin * 2 - gap) / 2
  const contentHeight = PAGE.landscapeHeight - top - bottom

  try {
    for (let index = 0; index < total; index += 1) {
      if (index > 0) doc.addPage("a4", "landscape")
      const pageNumber = index + 1
      const [englishPage, arabicPage] = await Promise.all([
        pageNumber <= englishSource.documentProxy.numPages
          ? renderPdfPage(englishSource.documentProxy, pageNumber, renderWidth)
          : Promise.resolve(undefined),
        pageNumber <= arabicSource.documentProxy.numPages
          ? renderPdfPage(arabicSource.documentProxy, pageNumber, renderWidth)
          : Promise.resolve(undefined),
      ])

      drawBilingualHeader({ doc, data: input.data, margin, columnWidth, gap })
      drawPageImage(doc, englishPage, margin, top, columnWidth, contentHeight, "No English page")
      drawPageImage(doc, arabicPage, margin + columnWidth + gap, top, columnWidth, contentHeight, "No Arabic page")
    }

  } finally {
    await englishSource.documentProxy.destroy?.()
    englishSource.loadingTask.destroy?.()
    await arabicSource.documentProxy.destroy?.()
    arabicSource.loadingTask.destroy?.()
  }

  addBilingualPageNumbers(doc)
  doc.setProperties({
    title: `${input.data.response.reportTitle} — Bilingual`,
    subject: input.data.response.subject || input.data.term.name,
    author: input.data.project.name,
    creator: "BuildSight AI Document Translation",
  })
  return doc.output("blob") as Blob
}

export async function exportTranslationPdf({
  data,
  translation,
  kind,
}: {
  data: StageTranslationPageData
  translation: StageTranslationRecord | null
  kind: PdfKind
}) {
  const base = safePdfFilename(data.project.code || data.project.name)
  const report = safePdfFilename(data.response.reportNumber)
  const sourcePdf = getSourcePdfAttachment(data)
  let sourceDocument: ExtractedSourceDocument | null = null
  if (sourcePdf) {
    try {
      sourceDocument = await extractSourcePdf(data, sourcePdf, {
        includePageImages: true,
        imageWidth: 900,
        imageMode: "visuals",
      })
    } catch (error) {
      const details = error instanceof Error ? error.message : "Unknown PDF extraction error."
      throw new Error(`Unable to preserve images from the original PDF: ${details}`)
    }
  }

  if (kind === "original") {
    const englishTemplate = buildLanguagePdfTemplate({ data, translation, language: "en", sourceDocument })
    validateTemplateAssets(englishTemplate, sourceDocument)
    return {
      blob: await buildLanguagePdfBlob(englishTemplate),
      filename: `${base}-${report}-english-structured.pdf`,
    }
  }

  if (!translation?.translatedContent) throw new Error("Generate the Arabic translation before exporting PDFs.")
  const arabicTemplate = buildLanguagePdfTemplate({ data, translation, language: "ar", sourceDocument })
  const englishTemplate = buildLanguagePdfTemplate({ data, translation, language: "en", sourceDocument })
  validateTemplateAssets(arabicTemplate, sourceDocument)
  validateTemplateAssets(englishTemplate, sourceDocument)
  validateMirroredTemplates(englishTemplate, arabicTemplate)
  const arabicBlob = await buildLanguagePdfBlob(arabicTemplate)
  if (kind === "arabic") {
    return { blob: arabicBlob, filename: `${base}-${report}-arabic-translation.pdf` }
  }

  const englishBlob = await buildLanguagePdfBlob(englishTemplate)
  const bilingualBlob = await buildBilingualPdfBlob({ data, translation, englishBlob, arabicBlob, sourceDocument })
  return { blob: bilingualBlob, filename: `${base}-${report}-bilingual.pdf` }
}
