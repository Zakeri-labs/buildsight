"use client"

import { extractSourcePdf, loadPdfJs } from "@/lib/stage-translations/client-source-pdf"
import {
  buildLanguagePdfTemplate,
  validateLanguagePdfTemplate,
  type ExtractedPdfImage,
  type ExtractedPdfLayoutBlock,
  type ExtractedSourceDocument,
  type LanguagePdfTemplate,
  type PdfImageTemplate,
  type PdfKind,
  type PdfSectionTemplate,
} from "@/lib/stage-translations/pdf-templates"
import { getSourcePdfAttachment } from "@/lib/stage-translations/source-document"
import type { StageTranslationPageData, StageTranslationRecord } from "@/lib/stage-translations/types"
import type { ReportCcRecipient } from "@/lib/report-cc/types"
import { createClient as createSupabaseClient } from "@/lib/supabase/client"
import { getOrganizationProfile, fetchOrganizationProfileFromDb } from "@/lib/organization/profile"

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
const ARABIC_FONT_FILENAME = "GretaArabic-Regular.ttf"
const ARABIC_FONT_FAMILY = "GretaArabic"
const ARABIC_FONT_URL = "/fonts/GretaArabic-Regular.ttf"
const CLOSING_LOGO_URL = "/bonyan-closing-logo.png"

const LATIN_FONT_FILENAME = "helvetica"
const LATIN_FONT_FAMILY = "helvetica"
const LATIN_FONT_URL = ""

const TRANSLATION_BUCKET = "project-stage-translations"
const MAX_PDF_BYTES = 60 * 1024 * 1024

const PAGE = {
  portraitWidth: 210,
  portraitHeight: 297,
  landscapeWidth: 297,
  landscapeHeight: 210,
  margin: 14,
  footer: 23,
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
  closingLogoImage?: LoadedImage | null
}

let pdfToolsPromise: Promise<JsPdfConstructor> | null = null
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

let arabicFontPromise: Promise<string> | null = null
let latinFontPromise: Promise<string> | null = null

async function loadFontBase64(url: string, isArabic: boolean) {
  const cache = isArabic ? arabicFontPromise : latinFontPromise
  if (cache) return cache

  const promise = (async () => {
    const response = await fetch(url, { cache: "force-cache" })
    if (!response.ok) {
      throw new Error(`Font request failed with status ${response.status} for ${url}`)
    }
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength < 20000) throw new Error(`Invalid font bytes for ${url}`)
    return arrayBufferToBase64(bytes)
  })().catch((error) => {
    if (isArabic) arabicFontPromise = null
    else latinFontPromise = null
    throw error
  })

  if (isArabic) arabicFontPromise = promise
  else latinFontPromise = promise
  return promise
}

async function installFonts(doc: JsPdfDocument) {
  const [arBase64, laBase64] = await Promise.all([
    loadFontBase64(ARABIC_FONT_URL, true),
    loadFontBase64(LATIN_FONT_URL, false),
  ])

  if (!doc.existsFileInVFS?.(ARABIC_FONT_FILENAME)) {
    doc.addFileToVFS(ARABIC_FONT_FILENAME, arBase64)
  }
  if (!doc.existsFileInVFS?.(LATIN_FONT_FILENAME)) {
    doc.addFileToVFS(LATIN_FONT_FILENAME, laBase64)
  }

  const fontList = doc.getFontList?.() as Record<string, string[]> | undefined
  if (!fontList?.[ARABIC_FONT_FAMILY]) {
    doc.addFont(ARABIC_FONT_FILENAME, ARABIC_FONT_FAMILY, "normal")
  }
  if (!fontList?.[LATIN_FONT_FAMILY]) {
    doc.addFont(LATIN_FONT_FILENAME, LATIN_FONT_FAMILY, "normal")
    doc.addFont(LATIN_FONT_FILENAME, LATIN_FONT_FAMILY, "bold")
  }

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

export function formatReportPdfFilename(
  projectName: string | null | undefined,
  rawDate: string | null | undefined,
  languageType: "English" | "Bilingual" | "Arabic",
): string {
  const cleanName = (projectName || "Project")
    .trim()
    .replace(/[^\w\s\u0600-\u06ff-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")

  const safeProjectName = cleanName || "Project"

  let dateFormatted = "2026-01-01"
  try {
    if (rawDate) {
      const d = new Date(rawDate)
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear()
        const month = String(d.getMonth() + 1).padStart(2, "0")
        const day = String(d.getDate()).padStart(2, "0")
        dateFormatted = `${year}-${month}-${day}`
      } else {
        dateFormatted = rawDate.split("T")[0] || dateFormatted
      }
    }
  } catch {
    if (rawDate) dateFormatted = rawDate.split("T")[0] || dateFormatted
  }

  return `${safeProjectName}-${dateFormatted}-${languageType}.pdf`
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

export async function ensureBilingualPdfStored(input: {
  projectId: string
  stageId?: string
  termId?: string | null
  responseId?: string
  existingPath?: string | null
}): Promise<{ storagePath: string | null; translation?: any }> {
  if (input.existingPath) return { storagePath: input.existingPath }
  if (!input.projectId || !input.responseId) return { storagePath: null }

  try {
    const params = new URLSearchParams({
      projectId: input.projectId,
      stageId: input.stageId || "",
      ...(input.termId ? { termId: input.termId } : {}),
      responseId: input.responseId,
    })
    const res = await fetch(`/api/stage-translations?${params.toString()}`, { cache: "no-store" })
    if (!res.ok) return { storagePath: null }
    const payload = await res.json()
    const data = payload?.data
    if (!data || !data.translation?.id) return { storagePath: null }

    if (data.translation?.bilingualPdfPath) {
      return { storagePath: data.translation.bilingualPdfPath, translation: data.translation }
    }

    const pdfResult = await exportTranslationPdf({
      data,
      translation: data.translation,
      kind: "bilingual",
      ccRecipients: payload?.ccRecipients ?? [],
      appendClosingBlock: true,
    })

    const storedPath = await storeTranslationPdf({
      projectId: input.projectId,
      translationId: data.translation.id,
      kind: "bilingual",
      blob: pdfResult.blob,
      filename: pdfResult.filename,
    })

    const updatedTranslation = {
      ...data.translation,
      status: "completed",
      bilingualPdfPath: storedPath,
      generatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    return { storagePath: storedPath, translation: updatedTranslation }
  } catch (err) {
    console.error("Auto-generate bilingual PDF error before share:", err)
    return { storagePath: null }
  }
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
      const lower = text.toLowerCase()
      if (text && !lower.includes("project information") && !text.includes("معلومات المشروع")) {
        blocks.push({ type: "heading", level: Number(tag.slice(1)), text })
      }
      return
    }
    if (tag === "p" || tag === "blockquote") {
      const text = normalizeText(node.textContent || "")
      const isRedundantHeader = /^(?:Observations|Directives|Recommendations|الملاحظات|مشاهدات|التوجيهات|دستورالعمل‌ها)\s*[\/:]/i.test(text)
      if (text && !isRedundantHeader) blocks.push({ type: "paragraph", text })
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

function flattenPdfBlocks(blocks: PdfBlock[]): PdfBlock[] {
  const flattened: PdfBlock[] = []
  for (const block of blocks) {
    if (block.type === "list") {
      for (let i = 0; i < block.items.length; i += 1) {
        flattened.push({
          type: "paragraph",
          text: block.items[i],
          bullet: block.ordered ? `${i + 1}.` : "•",
          indent: 2,
        } as any)
      }
    } else {
      flattened.push(block)
    }
  }
  return flattened
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

async function normalizeImage(dataUrl: string, isPngHint = false): Promise<LoadedImage> {
  const isPng = isPngHint || dataUrl.startsWith("data:image/png") || dataUrl.startsWith("data:image/webp")
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
  const cleanPath = src.split("?")[0].toLowerCase()
  const isJpeg = src.startsWith("data:image/jpeg") || src.startsWith("data:image/jpg") || cleanPath.endsWith(".jpg") || cleanPath.endsWith(".jpeg")
  const isPng = !isJpeg
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
  doc.setFont(rtl ? ARABIC_FONT_FAMILY : LATIN_FONT_FAMILY, rtl ? "normal" : bold ? "bold" : "normal")
  doc.setFontSize(fontSize)
  doc.setCharSpace?.(0)
}

function shapeArabicText(doc: JsPdfDocument, text: string | string[]) {
  const shape = (value: string) => {
    if (!value || !containsArabic(value)) return value
    try {
      const clean = normalizeText(value).replace(/[^\u0000-\uFFFF]/g, "")
      const shaped = String(doc.processArabic(clean.normalize("NFC")))
      return shaped.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    } catch {
      return value
    }
  }
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
  const isStringArray = Array.isArray(text)
  const containsAnyArabic = isStringArray
    ? text.some((item) => containsArabic(item))
    : containsArabic(text)

  if (rtl && !containsAnyArabic) {
    doc.setFont(LATIN_FONT_FAMILY, "normal")
    doc.text(text, x, y, options)
    doc.setFont(ARABIC_FONT_FAMILY, "normal")
    return
  }

  const useArabicMode = rtl || containsAnyArabic
  if (containsAnyArabic) {
    doc.setFont(ARABIC_FONT_FAMILY, "normal")
  }
  const preparedText = useArabicMode ? shapeArabicText(doc, text) : text
  doc.text(preparedText, x, y, useArabicMode ? { ...options, ...ARABIC_TEXT_OPTIONS } : options)
}

function textLines(doc: JsPdfDocument, text: string, width: number) {
  const normalized = normalizeText(text) || "—"
  const split = doc.splitTextToSize(normalized, Math.max(8, width))
  return Array.isArray(split) ? split : [String(split)]
}

function drawHeaderColumns(doc: JsPdfDocument, flow: Flow, headerH: number) {
  const { template, pageWidth, logoImage } = flow
  const org = getOrganizationProfile()
  const margin = PAGE.margin
  const headerTop = 4.5

  // Light gray background, thin gold top
  doc.setFillColor(248, 250, 252)
  doc.rect(0, headerTop, pageWidth, headerH, "F")
  doc.setFillColor(180, 138, 32)
  doc.rect(0, headerTop, pageWidth, 1.5, "F")

  // ── 3-COLUMN LAYOUT: [Logo] | [Company Name] | [Date/Doc/Page] ────
  const totalW = pageWidth - margin * 2  // 182 mm
  const col1W = 50   // Left  – Logo (enlarged area)
  const col3W = 44   // Right – Date / Doc / Page (3 rows) – compact width
  const col2W = totalW - col1W - col3W   // Center – Company names
  const col1X = 10   // Move logo further to the left
  const col2X = margin + col1W
  const col3X = margin + col1W + col2W

  // ── LEFT COLUMN: Logo (Left-aligned, larger & further left) ────────────────────────────────────
  if (logoImage) {
    const maxH = 24   // Larger logo height (fits inside headerH=35)
    const maxW = 54   // Larger logo width
    const ratio = Math.min(maxW / logoImage.width, maxH / logoImage.height)
    const w = logoImage.width * ratio
    const h = logoImage.height * ratio
    const imgFormat = logoImage.dataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG"
    doc.addImage(
      logoImage.dataUrl, imgFormat,
      col1X,   // Left-aligned further to the left
      headerTop + 1.5 + (headerH - 1.5 - h) / 2,
      w, h, undefined, "FAST",
    )
  } else {
    setLanguage(doc, false, 10, true)
    doc.setTextColor(180, 138, 32)
    doc.text("BONYAN", col1X, headerTop + headerH / 2 + 2, { align: "left" })
  }

  // ── CENTER COLUMN: Company Name (EN + AR) Bold Center-aligned (moved upward near top golden line) ─────
  const nameEn = org.nameEn || "BONYAN CONSTRUCTION FOR ENGINEERING CONSULTANCY"
  const nameAr = org.nameAr || "بنيان الإنشائية للاستشارات الهندسية"
  const cx = col2X + col2W / 2
  const topTextY = headerTop + 1.5 + 5.5   // Placed upward just below top golden line

  // English name – Bold, auto-scale to fit col2W
  let enSize = 10.5
  setLanguage(doc, false, enSize, true)
  while (doc.getTextWidth(nameEn) > col2W - 4 && enSize > 5) {
    enSize -= 0.3
    setLanguage(doc, false, enSize, true)
  }
  doc.setTextColor(15, 23, 42)
  doc.text(nameEn, cx, topTextY, { align: "center" })

  // Arabic name – Bold, auto-scale to fit col2W
  let arSize = 8.5
  setLanguage(doc, true, arSize, true)
  const shapedAr = String(shapeArabicText(doc, nameAr))
  while (doc.getTextWidth(shapedAr) > col2W - 4 && arSize > 5) {
    arSize -= 0.3
    setLanguage(doc, true, arSize, true)
  }
  doc.setTextColor(180, 138, 32)
  writePdfText(doc, nameAr, cx, topTextY + 5.5, { align: "center" }, true)

  // ── RIGHT COLUMN: Date / Document No. / Page (Right-aligned, aligned in upper header area) ──
  const rawDate = template.createdAt || ""
  const formattedDate = (() => {
    try {
      if (!rawDate) return "—"
      const d = new Date(rawDate)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    } catch {
      return rawDate.split("T")[0] || "—"
    }
  })()

  const rtl = flow.rtl
  const infoRows = [
    { label: rtl ? "التاريخ:" : "Date:",    value: formattedDate },
    { label: rtl ? "رقم المستند:" : "Doc No.:", value: template.reportNumber || "—" },
    { label: rtl ? "الصفحة:" : "Page:",    value: String(flow.pageNumber) },
  ]
  const labelX  = col3X + 2.5
  const rightX  = col3X + col3W - 2.5
  const stepY   = 4.0   // line spacing
  const startY  = headerTop + 1.5 + 14.5 // aligned downward to align bottom of text block with logo bottom edge (Y = 20.5mm)

  infoRows.forEach(({ label, value }, i) => {
    const y = startY + i * stepY

    if (rtl) {
      // Arabic (RTL): Label on Right edge, Value on Left edge
      setLanguage(doc, true, 6.5, false)
      doc.setTextColor(100, 116, 139)
      const shapedLabel = String(shapeArabicText(doc, label))
      doc.text(shapedLabel, rightX, y, { align: "right" })

      setLanguage(doc, false, 7.5, false)
      doc.setTextColor(15, 23, 42)
      doc.text(value, labelX, y, { align: "left" })
    } else {
      // English (LTR): Label on Left edge, Value on Right edge
      setLanguage(doc, false, 6.5, false)
      doc.setTextColor(100, 116, 139)
      doc.text(label, labelX, y, { align: "left" })

      setLanguage(doc, false, 7.5, false)
      doc.setTextColor(15, 23, 42)
      doc.text(value, rightX, y, { align: "right" })
    }
  })

  // Bottom separator
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.4)
  doc.line(0, headerTop + headerH, pageWidth, headerTop + headerH)
  doc.setLineWidth(0.2)
}

function drawContinuationHeader(flow: Flow) {
  const headerH = 35   // expanded height (~4 cm total header area)
  drawHeaderColumns(flow.doc, flow, headerH)
  flow.y = 4.5 + headerH + 7
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
  // Light gray card background with subtle rounded corners & border
  doc.setDrawColor(226, 232, 240)
  doc.setFillColor(248, 250, 252)   // light gray slate fill
  doc.roundedRect(x, y, width, 14, 1.2, 1.2, "FD")

  setLanguage(doc, rtl, 6.5, false)
  doc.setTextColor(100, 116, 139)
  writePdfText(doc, label,
    rtl ? x + width - 3 : x + 3,
    y + 4.2,
    { align: rtl ? "right" : "left" },
    rtl,
  )

  const valHasArabic = containsArabic(value)
  setLanguage(doc, valHasArabic, 8, true)   // 8pt BOLD value (refined size)
  doc.setTextColor(15, 23, 42)
  const lines = textLines(doc, value, width - 6).slice(0, 2)
  writePdfText(
    doc,
    lines,
    rtl && valHasArabic ? x + width - 3 : x + 3,
    y + 8.8,
    { align: rtl && valHasArabic ? "right" : "left", lineHeightFactor: 1.1 },
    valHasArabic,
  )
}

function drawCcMetadata(flow: Flow, x: number, y: number, width: number, recipients: string[]) {
  if (!recipients.length) return 0
  const { doc, rtl } = flow
  const label = rtl ? "نسخة إلى:" : "CC To:"
  const contentWidth = width - 14
  const entries = recipients.map((recipient) => {
    const [rawName, ...rawDetails] = recipient
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean)
    const name = rawName || "—"
    setLanguage(doc, containsArabic(name), 8, true)
    const nameLines = textLines(doc, name, contentWidth)
    const detailLines = rawDetails.flatMap((detail) => {
      setLanguage(doc, containsArabic(detail), 7, false)
      return textLines(doc, detail, contentWidth)
    })
    return { nameLines, detailLines }
  })
  const nameLineHeight = 3.8
  const detailLineHeight = 3.35
  const recipientGap = 2.2
  const contentHeight = entries.reduce((total, entry) => (
    total
    + entry.nameLines.length * nameLineHeight
    + entry.detailLines.length * detailLineHeight
    + recipientGap
  ), 0)
  const height = Math.max(16, 9 + contentHeight)

  doc.setDrawColor(226, 232, 240)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(x, y, width, height, 1.2, 1.2, "FD")

  setLanguage(doc, rtl, 6.5, false)
  doc.setTextColor(100, 116, 139)
  writePdfText(doc, label, rtl ? x + width - 3 : x + 3, y + 4.2, { align: rtl ? "right" : "left" }, rtl)

  const bulletX = rtl ? x + width - 4 : x + 4
  const textX = rtl ? x + width - 9 : x + 9
  let cursorY = y + 9

  for (const entry of entries) {
    setLanguage(doc, false, 8, true)
    doc.setTextColor(180, 138, 32)
    doc.text("•", bulletX, cursorY, { align: rtl ? "right" : "left" })

    for (const line of entry.nameLines) {
      const lineHasArabic = containsArabic(line)
      setLanguage(doc, lineHasArabic, 8, true)
      doc.setTextColor(15, 23, 42)
      writePdfText(doc, line, textX, cursorY, { align: rtl ? "right" : "left" }, lineHasArabic)
      cursorY += nameLineHeight
    }

    for (const line of entry.detailLines) {
      const lineHasArabic = containsArabic(line)
      setLanguage(doc, lineHasArabic, 7, false)
      doc.setTextColor(100, 116, 139)
      writePdfText(doc, line, textX, cursorY, { align: rtl ? "right" : "left" }, lineHasArabic)
      cursorY += detailLineHeight
    }
    cursorY += recipientGap
  }

  return height
}

function formatDateShort(dateStr?: string | null, rtl: boolean = false) {
  if (!dateStr) return "—"
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    return date.toLocaleDateString(rtl ? "ar-SA" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch {
    return dateStr
  }
}

function drawFirstPageHeader(
  flow: Flow,
  options: {
    bilingualSupervisorLabel?: boolean
    bilingualProjectLocationCell?: boolean
  } = {},
) {
  const { doc, template, pageWidth, rtl } = flow
  const margin = PAGE.margin
  const headerTop = 4.5
  const headerH = 35

  drawHeaderColumns(doc, flow, headerH)

  // ── TITLE BLOCK (below the 3-column header) ───────────────────────────────
  const visitFormatted = String(template.visitNumber || 1).padStart(3, "0")
  let cleanTitle = (template.termName || template.title || template.stageName || "Report")
    .replace(/^\d+[\.\s\-]+/, "")
    .trim()

  const visitRegex = /^(?:Visit|زيارة)\s*[\d٠-٩]+\s*[-–—:]\s*/i
  if (visitRegex.test(cleanTitle)) {
    cleanTitle = cleanTitle.replace(visitRegex, "").trim()
  }

  const visitPrefix = rtl ? `زيارة ${visitFormatted}` : `Visit ${visitFormatted}`
  const reportMainTitle = `${visitPrefix} - ${cleanTitle}`

  const rawSubject = (template.subject || "").trim()
  const hasSubject = Boolean(
    rawSubject &&
      rawSubject !== "—" &&
      rawSubject !== "No content recorded." &&
      rawSubject !== "لا يوجد محتوى مسجل.",
  )

  setLanguage(doc, rtl, 15, true)
  doc.setTextColor(15, 23, 42)
  writePdfText(
    doc,
    reportMainTitle,
    rtl ? pageWidth - margin : margin,
    headerTop + headerH + 8,
    { align: rtl ? "right" : "left" },
    rtl,
  )

  let titleBlockOffset = 13
  if (hasSubject) {
    setLanguage(doc, rtl, 9.5, false)
    doc.setTextColor(71, 85, 105)
    writePdfText(
      doc,
      rawSubject,
      rtl ? pageWidth - margin : margin,
      headerTop + headerH + 13.5,
      { align: rtl ? "right" : "left" },
      rtl,
    )
    titleBlockOffset = 18.5
  }

  // Thin rule below title
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.3)
  doc.line(margin, headerTop + headerH + titleBlockOffset, pageWidth - margin, headerTop + headerH + titleBlockOffset)
  doc.setLineWidth(0.2)

  // ── UNIFIED EXECUTIVE METADATA CARD (Recipients + 8 Metadata Cells) ──────
  const cardX = margin
  const cardWidth = pageWidth - margin * 2
  const gridTop = headerTop + headerH + titleBlockOffset + 2
  const useBilingualLocationCell = true

  const reportTo = template.reportToRecipients || []
  const ccTo = template.ccRecipients || []

  const wrappedRecipientHeight = (rList: typeof reportTo, width: number, isRtl: boolean) => {
    if (!rList.length) return 10

    let cursorY = 7.8
    let lastBaselineY = cursorY

    rList.forEach((recipient, recipientIndex) => {
      const measureField = (value: string, fontSize: number, bold: boolean, lineHeight: number) => {
        const fieldRtl = isRtl || containsArabic(value)
        setLanguage(doc, fieldRtl, fontSize, bold)
        const lines = textLines(doc, value, width - 6)
        lines.forEach(() => {
          lastBaselineY = cursorY
          cursorY += lineHeight
        })
      }

      measureField(recipient.name, 7.5, true, 3.4)
      if (recipient.role) measureField(recipient.role, 6.5, false, 3.2)
      if (recipient.company) measureField(recipient.company, 6.5, false, 3.2)
      if (recipient.phone) {
        setLanguage(doc, false, 6.2, false)
        const lines = textLines(doc, recipient.phone, width - 6)
        lines.forEach(() => {
          lastBaselineY = cursorY
          cursorY += 3.2
        })
      }
      if (recipient.email) {
        setLanguage(doc, false, 6.2, false)
        const lines = textLines(doc, recipient.email, width - 6)
        lines.forEach(() => {
          lastBaselineY = cursorY
          cursorY += 3.2
        })
      }

      if (recipientIndex < rList.length - 1) cursorY += 1.2
    })

    return lastBaselineY + 1.8
  }

  const locationLabelFontSize = 6.2
  const locationValueFontSize = 6.5
  const locationLineHeight = 3.2
  const locationRowGap = 0.35
  const locationInlineGap = 0.9
  const locationTopInset = 4
  const locationBottomInset = 1.2
  const projectLocationFields = (
    rtl
      ? [
          { label: "العنوان", value: template.projectAddress },
          { label: "المرحلة", value: template.projectPhase },
          { label: "رقم القطعة", value: template.projectPlotNo },
        ]
      : [
          { label: "Address", value: template.projectAddress },
          { label: "Phase", value: template.projectPhase },
          { label: "Plot No.", value: template.projectPlotNo },
        ]
  ).filter((field) => field.value.trim().length > 0)

  const getInlineLocationLayout = (label: string, value: string, width: number, isRtl: boolean) => {
    const labelText = `${label}:`
    setLanguage(doc, isRtl, locationLabelFontSize, true)
    const labelWidth = doc.getTextWidth(labelText)

    const valueRtl = isRtl || containsArabic(value)
    setLanguage(doc, valueRtl, locationValueFontSize, false)
    const fullValueWidth = Math.max(8, width - 6)
    const firstLineWidth = Math.max(8, fullValueWidth - labelWidth - locationInlineGap)
    const firstPass = textLines(doc, value, firstLineWidth)
    const lines = firstPass.length <= 1
      ? firstPass
      : [firstPass[0], ...textLines(doc, firstPass.slice(1).join(" "), fullValueWidth)]

    return { labelText, labelWidth, valueRtl, lines }
  }

  const cols = 3
  const cellW = cardWidth / cols
  const metaRowH = 11
  let recipientsRowH: number

  let locationCursorY = locationTopInset
  let locationLastBaselineY = locationTopInset

  projectLocationFields.forEach((field, index) => {
    const isInline = field.label.includes("Plot") || field.label.includes("Phase") || field.label.includes("القطعة") || field.label.includes("المرحلة")
    if (isInline) {
      locationCursorY += locationLineHeight
      locationLastBaselineY = locationCursorY
    } else {
      // stacked layout: label takes 1 line, then value lines
      locationCursorY += locationLineHeight  // label line
      const valueRtlCheck = rtl || containsArabic(field.value)
      setLanguage(doc, valueRtlCheck, locationValueFontSize, false)
      const valLines = textLines(doc, field.value, cellW - 6)
      valLines.forEach((_, lineIndex) => {
        locationLastBaselineY = locationCursorY + lineIndex * locationLineHeight
      })
      locationCursorY += valLines.length * locationLineHeight
    }
    if (index < projectLocationFields.length - 1) locationCursorY += locationRowGap + 0.5
  })

  const locationCellHeight = projectLocationFields.length
    ? locationLastBaselineY + locationBottomInset
    : locationTopInset + locationBottomInset

  recipientsRowH = Math.max(
    wrappedRecipientHeight(reportTo, cellW, rtl),
    locationCellHeight,
    wrappedRecipientHeight(ccTo, cellW, rtl),
    13,
  )

  const gridHeight = recipientsRowH + 2 * metaRowH

  // Single outer container
  doc.setDrawColor(226, 232, 240)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(cardX, gridTop, cardWidth, gridHeight, 1.5, 1.5, "FD")

  // Internal grid lines
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.15)

  // Horizontal divider between Recipients Row (Row 1) and Meta Row 1 (Row 2)
  doc.line(cardX, gridTop + recipientsRowH, cardX + cardWidth, gridTop + recipientsRowH)

  // Horizontal divider between Meta Row 1 (Row 2) and Meta Row 2 (Row 3)
  doc.line(cardX, gridTop + recipientsRowH + metaRowH, cardX + cardWidth, gridTop + recipientsRowH + metaRowH)

  // Align the first-row cell borders with the three-column rows.
  for (let c = 1; c < cols; c += 1) {
    doc.line(cardX + c * cellW, gridTop, cardX + c * cellW, gridTop + recipientsRowH)
  }

  // Vertical lines between 3 columns in Row 2 & Row 3
  for (let c = 1; c < cols; c += 1) {
    doc.line(cardX + c * cellW, gridTop + recipientsRowH, cardX + c * cellW, gridTop + gridHeight)
  }

  // ── RENDER ROW 1 ─────────────────────────────────────────────────────────
  const drawWrappedBilingualRecipientColumn = (
    recList: typeof reportTo,
    colLabel: string,
    x: number,
    w: number,
    isRtl: boolean,
  ) => {
    setLanguage(doc, isRtl, 6.2, true)
    doc.setTextColor(100, 116, 139)
    writePdfText(
      doc,
      colLabel,
      isRtl ? x + w - 3 : x + 3,
      gridTop + 3.5,
      { align: isRtl ? "right" : "left" },
      isRtl,
    )

    if (!recList.length) {
      return
    }

    let currY = gridTop + 7.8
    const drawField = (
      value: string,
      fontSize: number,
      bold: boolean,
      lineHeight: number,
      color: [number, number, number],
      forceLatin = false,
    ) => {
      const fieldRtl = !forceLatin && (isRtl || containsArabic(value))
      setLanguage(doc, fieldRtl, fontSize, bold)
      doc.setTextColor(...color)
      const lines = textLines(doc, value, w - 6)
      const textX = fieldRtl ? x + w - 3 : x + 3
      const align = fieldRtl ? "right" : "left"
      lines.forEach((line) => {
        writePdfText(doc, line, textX, currY, { align }, fieldRtl)
        currY += lineHeight
      })
    }

    recList.forEach((recipient) => {
      drawField(recipient.name, 7.5, true, 3.4, [15, 23, 42])
      if (recipient.role) drawField(recipient.role, 6.5, false, 3.2, [71, 85, 105])
      // Only draw company if it differs from the recipient name
      if (recipient.company && recipient.company.trim() !== recipient.name.trim()) {
        drawField(recipient.company, 6.5, false, 3.2, [71, 85, 105])
      }
      if (recipient.phone) drawField(recipient.phone, 6.2, false, 3.2, [71, 85, 105], true)
      if (recipient.email) drawField(recipient.email, 6.2, false, 3.2, [0, 0, 0], true)
      currY += 1.2
    })
  }

  const drawProjectLocationColumn = (x: number, w: number, isRtl: boolean) => {
    let cursorY = gridTop + locationTopInset

    projectLocationFields.forEach((field, fieldIndex) => {
      const labelText = `${field.label}:`
      const valueRtl = isRtl || containsArabic(field.value)
      const isInline = field.label.includes("Plot") || field.label.includes("Phase") || field.label.includes("القطعة") || field.label.includes("المرحلة")

      if (isInline) {
        setLanguage(doc, isRtl, locationLabelFontSize, true)
        doc.setTextColor(100, 116, 139)
        const labelW = doc.getTextWidth(labelText)

        if (isRtl) {
          writePdfText(doc, labelText, x + w - 3, cursorY, { align: "right" }, true)
          setLanguage(doc, valueRtl, locationValueFontSize, true)
          doc.setTextColor(15, 23, 42)
          writePdfText(doc, field.value, x + w - 3 - labelW - 1.5, cursorY, { align: "right" }, valueRtl)
        } else {
          writePdfText(doc, labelText, x + 3, cursorY, { align: "left" }, false)
          setLanguage(doc, valueRtl, locationValueFontSize, true)
          doc.setTextColor(15, 23, 42)
          writePdfText(doc, field.value, x + 3 + labelW + 1.5, cursorY, { align: "left" }, valueRtl)
        }
        cursorY += locationLineHeight
      } else {
        // Label on its own line
        setLanguage(doc, isRtl, locationLabelFontSize, true)
        doc.setTextColor(100, 116, 139)
        writePdfText(
          doc,
          labelText,
          isRtl ? x + w - 3 : x + 3,
          cursorY,
          { align: isRtl ? "right" : "left" },
          isRtl,
        )
        cursorY += locationLineHeight

        // Value on next line(s)
        setLanguage(doc, valueRtl, locationValueFontSize, false)
        doc.setTextColor(71, 85, 105)
        const valLines = textLines(doc, field.value, w - 6)
        valLines.forEach((line) => {
          writePdfText(
            doc,
            line,
            valueRtl ? x + w - 3 : x + 3,
            cursorY,
            { align: valueRtl ? "right" : "left" },
            valueRtl,
          )
          cursorY += locationLineHeight
        })
      }

      if (fieldIndex < projectLocationFields.length - 1) cursorY += locationRowGap + 0.5
    })
  }

  const reportToX = rtl ? cardX + 2 * cellW : cardX
  const ccToX = cardX + cellW
  const locationX = rtl ? cardX : cardX + 2 * cellW

  const reportToLabel = rtl ? "إرسال إلى:" : "Report to:"
  const ccToLabel = rtl ? "نسخة إلى:" : "CC to:"

  drawWrappedBilingualRecipientColumn(reportTo, reportToLabel, reportToX, cellW, rtl)
  drawWrappedBilingualRecipientColumn(ccTo, ccToLabel, ccToX, cellW, rtl)
  drawProjectLocationColumn(locationX, cellW, rtl)

  // ── RENDER ROW 2 & 3: THE 6 METADATA CELLS (Matching details page 1:1) ──────
  const formattedDate = formatDateShort(template.createdAt, rtl)
  const creator = template.creatorName || "—"

  const labels = rtl
    ? ["المشروع", "المرحلة", "رقم الزيارة", "رقم المستند", "التاريخ", "المشرف"]
    : ["Project", "Stage", "Visit Number", "Report Number", "Date", "Supervisor"]

  const values = [
    template.projectName,
    template.stageName,
    template.visitNumber,
    template.reportNumber,
    formattedDate,
    creator,
  ]

  const metaTop = gridTop + recipientsRowH

  for (let index = 0; index < values.length; index += 1) {
    const row = Math.floor(index / cols)
    const logicalColumn = index % cols
    const physicalColumn = rtl ? (cols - 1) - logicalColumn : logicalColumn
    const cellX = cardX + physicalColumn * cellW
    const cellY = metaTop + row * metaRowH

    // Label
    doc.setTextColor(100, 116, 139)
    if (options.bilingualSupervisorLabel && index === values.length - 1) {
      setLanguage(doc, false, 6, false)
      writePdfText(
        doc,
        "Supervisor",
        cellX + 3,
        cellY + 3.5,
        { align: "left" },
        false,
      )
    } else {
      setLanguage(doc, rtl, 6, false)
      writePdfText(
        doc,
        labels[index],
        rtl ? cellX + cellW - 3 : cellX + 3,
        cellY + 3.5,
        { align: rtl ? "right" : "left" },
        rtl,
      )
    }

    // Value
    const val = values[index] || "—"
    const valHasArabic = containsArabic(val)
    setLanguage(doc, valHasArabic, 7.5, true)
    doc.setTextColor(15, 23, 42)
    const valLines = textLines(doc, val, cellW - 6).slice(0, 1)
    writePdfText(
      doc,
      valLines,
      rtl && valHasArabic ? cellX + cellW - 3 : cellX + 3,
      cellY + 7.5,
      { align: rtl && valHasArabic ? "right" : "left" },
      valHasArabic,
    )
  }

  flow.y = gridTop + gridHeight + 6
}
function renderTranslationClosingBlock(flow: Flow) {
  const closingLogo = flow.closingLogoImage
  if (!closingLogo) throw new Error("Unable to load the closing signature logo for the translated PDF.")

  const firstLine = flow.rtl ? "وتفضلوا بقبول فائق الاحترام،" : "Yours faithfully,"
  const companyLine = flow.rtl
    ? "عن شركة بنيان للإنشاءات والاستشارات الهندسية"
    : "For BONYAN CONSTRUCTION FOR ENGINEERING CONSULTANCY"
  const fontSize = 9
  const lineHeight = 4.4
  const logoWidth = 28
  const logoHeight = logoWidth * closingLogo.height / Math.max(1, closingLogo.width)
  const lineToLogoGap = 2.2
  const logoToCompanyGap = 4.2
  const bottomGap = 4

  setLanguage(flow.doc, flow.rtl, fontSize, false)
  const firstLines = textLines(flow.doc, firstLine, flow.width)
  const companyLines = textLines(flow.doc, companyLine, flow.width)
  const requiredHeight = firstLines.length * lineHeight
    + lineToLogoGap
    + logoHeight
    + logoToCompanyGap
    + companyLines.length * lineHeight
    + bottomGap

  // The closing is one indivisible unit. If it does not fit, start the whole
  // block on the next page rather than splitting its text and logo.
  ensureSpace(flow, requiredHeight)

  const textX = flow.rtl ? flow.x + flow.width : flow.x
  const alignment = flow.rtl ? "right" : "left"
  flow.doc.setTextColor(51, 65, 85)
  writePdfText(
    flow.doc,
    firstLines,
    textX,
    flow.y,
    { align: alignment, lineHeightFactor: 1.2 },
    flow.rtl,
  )

  const logoY = flow.y + firstLines.length * lineHeight + lineToLogoGap
  const logoX = flow.rtl ? flow.x + flow.width - logoWidth : flow.x
  flow.doc.addImage(
    closingLogo.dataUrl,
    "PNG",
    logoX,
    logoY,
    logoWidth,
    logoHeight,
    undefined,
    "FAST",
  )

  setLanguage(flow.doc, flow.rtl, fontSize, false)
  flow.doc.setTextColor(51, 65, 85)
  const companyY = logoY + logoHeight + logoToCompanyGap
  writePdfText(
    flow.doc,
    companyLines,
    textX,
    companyY,
    { align: alignment, lineHeightFactor: 1.2 },
    flow.rtl,
  )
  flow.y = companyY + companyLines.length * lineHeight + bottomGap
}

function renderBilingualTranslationClosingBlock(flow: Flow) {
  const closingLogo = flow.closingLogoImage
  if (!closingLogo) throw new Error("Unable to load the closing signature logo for the bilingual PDF.")

  const englishFirstLine = "Yours faithfully,"
  const arabicFirstLine = "وتفضلوا بقبول فائق الاحترام،"
  const englishCompanyLine = "For BONYAN CONSTRUCTION FOR ENGINEERING CONSULTANCY"
  const arabicCompanyLine = "عن شركة بنيان للإنشاءات والاستشارات الهندسية"

  const columnGap = 12
  const columnWidth = (flow.width - columnGap) / 2
  const fontSize = 8.5
  const textLineHeightFactor = 1.2
  const lineHeight = fontSize * 0.352778 * textLineHeightFactor
  const textLineGap = 1.2
  const logoWidth = 28
  const logoHeight = logoWidth * closingLogo.height / Math.max(1, closingLogo.width)
  const bottomGap = 4

  setLanguage(flow.doc, false, fontSize, false)
  const englishFirstLines = textLines(flow.doc, englishFirstLine, columnWidth)
  setLanguage(flow.doc, true, fontSize, false)
  const arabicFirstLines = textLines(flow.doc, arabicFirstLine, columnWidth)
  setLanguage(flow.doc, false, fontSize, false)
  const englishCompanyLines = textLines(flow.doc, englishCompanyLine, columnWidth)
  setLanguage(flow.doc, true, fontSize, false)
  const arabicCompanyLines = textLines(flow.doc, arabicCompanyLine, columnWidth)

  const firstLineRowHeight = Math.max(englishFirstLines.length, arabicFirstLines.length, 1) * lineHeight
  const companyRowHeight = Math.max(englishCompanyLines.length, arabicCompanyLines.length, 1) * lineHeight
  const textBlockHeight = firstLineRowHeight + textLineGap + companyRowHeight

  // Vertically center the single shared logo against the complete paired text
  // area instead of placing it in a detached row beneath the two columns.
  const contentHeight = Math.max(textBlockHeight, logoHeight)
  const requiredHeight = contentHeight + bottomGap

  // Keep the paired two-line text blocks and their single shared logo together.
  ensureSpace(flow, requiredHeight)

  const textTopY = flow.y + (contentHeight - textBlockHeight) / 2
  const logoY = flow.y + (contentHeight - logoHeight) / 2
  const companyRowY = textTopY + firstLineRowHeight + textLineGap

  flow.doc.setTextColor(51, 65, 85)
  setLanguage(flow.doc, false, fontSize, false)
  writePdfText(
    flow.doc,
    englishFirstLines,
    flow.x,
    textTopY,
    { align: "left", baseline: "top", lineHeightFactor: textLineHeightFactor },
    false,
  )
  writePdfText(
    flow.doc,
    englishCompanyLines,
    flow.x,
    companyRowY,
    { align: "left", baseline: "top", lineHeightFactor: textLineHeightFactor },
    false,
  )

  setLanguage(flow.doc, true, fontSize, false)
  writePdfText(
    flow.doc,
    arabicFirstLines,
    flow.x + flow.width,
    textTopY,
    { align: "right", baseline: "top", lineHeightFactor: textLineHeightFactor },
    true,
  )
  writePdfText(
    flow.doc,
    arabicCompanyLines,
    flow.x + flow.width,
    companyRowY,
    { align: "right", baseline: "top", lineHeightFactor: textLineHeightFactor },
    true,
  )

  const logoX = flow.x + (flow.width - logoWidth) / 2
  flow.doc.addImage(
    closingLogo.dataUrl,
    "PNG",
    logoX,
    logoY,
    logoWidth,
    logoHeight,
    undefined,
    "FAST",
  )

  flow.y = flow.y + contentHeight + bottomGap
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
  setLanguage(flow.doc, flow.rtl, 9, false)
  const indent = options.indent ?? 0
  const bulletWidth = options.bullet ? 6 : 0
  const available = flow.width - indent - bulletWidth
  const lines = textLines(flow.doc, text, available)
  const lineHeight = 4.4
  const height = Math.max(lineHeight, lines.length * lineHeight) + 0.6
  ensureSpace(flow, height)
  flow.doc.setTextColor(51, 65, 85)
  if (options.bullet) {
    const bulletX = flow.rtl ? flow.x + flow.width - indent : flow.x + indent
    const bulletRtl = flow.rtl && containsArabic(options.bullet)
    setLanguage(flow.doc, bulletRtl, 9, false)
    writePdfText(
      flow.doc,
      options.bullet,
      bulletX,
      flow.y,
      { align: flow.rtl ? "right" : "left" },
      bulletRtl,
    )
    setLanguage(flow.doc, flow.rtl, 9, false)
  }
  const textX = flow.rtl
    ? flow.x + flow.width - indent - bulletWidth
    : flow.x + indent + bulletWidth
  writePdfText(
    flow.doc,
    lines,
    textX,
    flow.y,
    { align: flow.rtl ? "right" : "left", lineHeightFactor: 1.2 },
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
    const cellHasArabic = containsArabic(logicalValue)
    setLanguage(flow.doc, cellHasArabic, fontSize, false)
    flow.doc.setTextColor(...textColor)
    const lines = cells[sourceIndex]?.length ? cells[sourceIndex] : ["—"]
    writePdfText(
      flow.doc,
      lines,
      numeric ? x + width / 2 : cellHasArabic ? x + width - 2 : x + 2,
      y + 4.3,
      {
        align: numeric ? "center" : cellHasArabic ? "right" : "left",
        lineHeightFactor: 1.2,
      },
      cellHasArabic,
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

function drawChecklistVectorBadge(
  doc: JsPdfDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  isPassed: boolean,
  isFailed: boolean,
  isInProgress: boolean,
) {
  if (isPassed) {
    doc.setFillColor(22, 163, 74)
    doc.roundedRect(x, y, w, h, 0.8, 0.8, "F")
    doc.setDrawColor(255, 255, 255)
    doc.setLineWidth(0.5)
    doc.line(x + 0.8, y + 1.8, x + 1.5, y + 2.7)
    doc.line(x + 1.5, y + 2.7, x + 2.8, y + 0.9)
  } else if (isFailed) {
    doc.setFillColor(225, 29, 72)
    doc.roundedRect(x, y, w, h, 0.8, 0.8, "F")
    doc.setDrawColor(255, 255, 255)
    doc.setLineWidth(0.5)
    doc.line(x + 1.0, y + 1.0, x + 2.6, y + 2.6)
    doc.line(x + 2.6, y + 1.0, x + 1.0, y + 2.6)
  } else if (isInProgress) {
    doc.setFillColor(217, 119, 6)
    doc.roundedRect(x, y, w, h, 0.8, 0.8, "F")
    doc.setDrawColor(255, 255, 255)
    doc.setLineWidth(0.4)
    doc.line(x + 0.9, y + 0.9, x + 2.7, y + 0.9)
    doc.line(x + 0.9, y + 2.7, x + 2.7, y + 2.7)
    doc.line(x + 0.9, y + 0.9, x + 2.7, y + 2.7)
    doc.line(x + 2.7, y + 0.9, x + 0.9, y + 2.7)
  } else {
    doc.setFillColor(241, 245, 249)
    doc.setDrawColor(203, 213, 225)
    doc.roundedRect(x, y, w, h, 0.8, 0.8, "FD")
    doc.setDrawColor(148, 163, 184)
    doc.setLineWidth(0.4)
    doc.line(x + 1.1, y + 1.1, x + 2.5, y + 2.5)
    doc.line(x + 2.5, y + 1.1, x + 1.1, y + 2.5)
  }
}

type ChecklistStatusPresentation = {
  label: string
  passed: boolean
  failed: boolean
  inProgress: boolean
}

function checklistStatusPresentation(resultText: string, rtl: boolean): ChecklistStatusPresentation {
  const raw = normalizeText(resultText)
  const normalized = raw.toLowerCase().replace(/[\s-]+/g, "_")

  if (
    normalized === "fail"
    || normalized === "failed"
    || normalized === "rejected"
    || raw.includes("غير مطابق")
  ) {
    return {
      label: rtl ? "غير مطابق" : "Failed",
      passed: false,
      failed: true,
      inProgress: false,
    }
  }

  if (
    normalized === "in_progress"
    || normalized === "inprogress"
    || raw.includes("قيد التنفيذ")
  ) {
    return {
      label: rtl ? "قيد التنفيذ" : "In Progress",
      passed: false,
      failed: false,
      inProgress: true,
    }
  }

  if (
    normalized === "na"
    || normalized === "n/a"
    || normalized === "not_applicable"
    || raw.includes("لا ينطبق")
  ) {
    return {
      label: rtl ? "لا ينطبق" : "N/A",
      passed: false,
      failed: false,
      inProgress: false,
    }
  }

  const isEmpty = !raw
    || normalized === "pending"
    || normalized === "open"
    || raw.includes("غير مكتمل")

  if (
    !isEmpty
    && (
      normalized === "pass"
      || normalized === "passed"
      || normalized === "complete"
      || normalized === "completed"
      || raw.includes("مكتمل")
      || raw.includes("مطابق")
      || raw === "تم"
    )
  ) {
    return {
      label: rtl ? "مكتمل / مطابق" : "Passed",
      passed: true,
      failed: false,
      inProgress: false,
    }
  }

  return {
    label: isEmpty ? (rtl ? "غير مكتمل" : "Open") : raw,
    passed: false,
    failed: false,
    inProgress: false,
  }
}

function renderChecklistTable(flow: Flow, block: Extract<PdfBlock, { type: "table" }>) {
  const rows = (block && Array.isArray(block.rows)) ? block.rows : []
  if (!rows.length) return

  // Keep the compact icon-only status column and render the saved per-item
  // comment/reference as its own column. The Arabic table mirrors the same
  // three-column structure for RTL presentation.
  const statusWidth = flow.width * 0.09
  const itemWidth = flow.width * 0.57
  const commentWidth = flow.width - statusWidth - itemWidth
  const statusX = flow.rtl ? flow.x + commentWidth + itemWidth : flow.x
  const itemX = flow.rtl ? flow.x + commentWidth : flow.x + statusWidth
  const commentX = flow.rtl ? flow.x : flow.x + statusWidth + itemWidth
  const dividerXs = flow.rtl
    ? [flow.x + commentWidth, flow.x + commentWidth + itemWidth]
    : [flow.x + statusWidth, flow.x + statusWidth + itemWidth]
  const cellPadding = 2.2
  const badgeW = 3.6
  const badgeH = 3.6
  const textLineHeight = 4.1
  const headerLineHeight = 4.1

  const prepareTextLines = (text: string, width: number, rtl: boolean, fontSize: number) => {
    if (!normalizeText(text)) return [] as string[]
    setLanguage(flow.doc, rtl, fontSize, false)
    return textLines(flow.doc, text, width - cellPadding * 2)
  }

  const prepareRow = (row: string[]) => {
    // Checklist templates intentionally retain their source row shape:
    // [index, item, result, notes]. Only the visible PDF table changes.
    const itemText = row.length >= 2 ? row[1] : row[0]
    const resultText = row.length >= 3 ? row[2] : (row[1] || "")
    const commentText = row.length >= 4 ? row[3] : ""
    const itemLines = prepareTextLines(itemText, itemWidth, flow.rtl, 8.2)
    const commentLines = prepareTextLines(commentText, commentWidth, flow.rtl, 8)
    const status = checklistStatusPresentation(resultText, flow.rtl)
    const itemHeight = Math.max(1, itemLines.length) * textLineHeight
    const commentHeight = commentLines.length * textLineHeight
    const height = Math.max(7.2, Math.max(itemHeight, commentHeight, badgeH) + 2.8)

    return { itemLines, commentLines, status, height }
  }

  const preparedRows = rows.filter((row) => row.length > 0).map(prepareRow)
  if (!preparedRows.length) return

  const headerSpecs = flow.rtl
    ? [
        { text: "التعليق / المرجع", x: commentX, width: commentWidth, align: "right" as const, rtl: true },
        { text: "بند التفتيش", x: itemX, width: itemWidth, align: "right" as const, rtl: true },
        { text: "الحالة", x: statusX, width: statusWidth, align: "center" as const, rtl: true },
      ]
    : [
        { text: "Status", x: statusX, width: statusWidth, align: "center" as const, rtl: false },
        { text: "Inspection Item", x: itemX, width: itemWidth, align: "left" as const, rtl: false },
        { text: "Comment / Reference", x: commentX, width: commentWidth, align: "left" as const, rtl: false },
      ]

  const preparedHeaders = headerSpecs.map((header) => {
    setLanguage(flow.doc, header.rtl, 8.2, false)
    return {
      ...header,
      lines: textLines(flow.doc, header.text, header.width - cellPadding * 2),
    }
  })
  const headerHeight = Math.max(
    8.5,
    Math.max(...preparedHeaders.map((header) => header.lines.length), 1) * headerLineHeight + 3,
  )

  const drawCellFrame = (y: number, height: number, fill: [number, number, number]) => {
    flow.doc.setDrawColor(226, 232, 240)
    flow.doc.setFillColor(...fill)
    flow.doc.setLineWidth(0.15)
    flow.doc.rect(flow.x, y, flow.width, height, "FD")
    for (const dividerX of dividerXs) flow.doc.line(dividerX, y, dividerX, y + height)
  }

  const drawHeader = () => {
    drawCellFrame(flow.y, headerHeight, [248, 250, 252])
    flow.doc.setTextColor(15, 23, 42)

    for (const header of preparedHeaders) {
      setLanguage(flow.doc, header.rtl, 8.2, false)
      const textHeight = header.lines.length * headerLineHeight
      const startY = flow.y + (headerHeight - textHeight) / 2 + 3.2
      const textX = header.align === "center"
        ? header.x + header.width / 2
        : header.align === "right"
          ? header.x + header.width - cellPadding
          : header.x + cellPadding
      writePdfText(
        flow.doc,
        header.lines,
        textX,
        startY,
        { align: header.align, lineHeightFactor: 1.15 },
        header.rtl,
      )
    }

    flow.y += headerHeight
  }

  ensureSpace(flow, headerHeight + preparedRows[0].height)
  drawHeader()

  for (const row of preparedRows) {
    if (flow.y + row.height > flow.bottom) {
      addFlowPage(flow)
      drawHeader()
    }

    const rowY = flow.y
    drawCellFrame(rowY, row.height, [255, 255, 255])

    if (row.itemLines.length) {
      const itemTextHeight = row.itemLines.length * textLineHeight
      const itemStartY = rowY + (row.height - itemTextHeight) / 2 + 3
      setLanguage(flow.doc, flow.rtl, 8.2, false)
      flow.doc.setTextColor(51, 65, 85)
      writePdfText(
        flow.doc,
        row.itemLines,
        flow.rtl ? itemX + itemWidth - cellPadding : itemX + cellPadding,
        itemStartY,
        { align: flow.rtl ? "right" : "left", lineHeightFactor: 1.15 },
        flow.rtl,
      )
    }

    if (row.commentLines.length) {
      const commentTextHeight = row.commentLines.length * textLineHeight
      const commentStartY = rowY + (row.height - commentTextHeight) / 2 + 3
      setLanguage(flow.doc, flow.rtl, 8, false)
      flow.doc.setTextColor(51, 65, 85)
      writePdfText(
        flow.doc,
        row.commentLines,
        flow.rtl ? commentX + commentWidth - cellPadding : commentX + cellPadding,
        commentStartY,
        { align: flow.rtl ? "right" : "left", lineHeightFactor: 1.15 },
        flow.rtl,
      )
    }

    const badgeX = statusX + (statusWidth - badgeW) / 2
    const badgeY = rowY + (row.height - badgeH) / 2
    drawChecklistVectorBadge(
      flow.doc,
      badgeX,
      badgeY,
      badgeW,
      badgeH,
      row.status.passed,
      row.status.failed,
      row.status.inProgress,
    )

    flow.y += row.height
  }

  flow.y += 5
}

function renderNativeVectorTable(flow: Flow, headers: string[], rows: string[][]) {
  if (!rows.length) return
  const colCount = Math.max(headers.length, ...rows.map((r) => r.length))
  if (!colCount) return

  const padding = 1.5
  const lineH = 4.2

  // Allocate 26% for label column and 74% for value column in 2-column key-value tables
  const colWidths = colCount === 2
    ? (flow.rtl ? [flow.width * 0.74, flow.width * 0.26] : [flow.width * 0.26, flow.width * 0.74])
    : Array(colCount).fill(flow.width / colCount)

  const getColX = (c: number) => {
    let currentX = flow.x
    for (let i = 0; i < c; i += 1) currentX += colWidths[i]
    return currentX
  }

  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r]
    const cellLinesList: string[][] = []
    let maxLines = 1

    for (let c = 0; c < colCount; c += 1) {
      const cellText = row[c] || ""
      const textW = colWidths[c] - padding * 2
      setLanguage(flow.doc, flow.rtl, 8, false)
      const lines = textLines(flow.doc, cellText, textW)
      cellLinesList.push(lines)
      if (lines.length > maxLines) maxLines = lines.length
    }

    const rowHeight = Math.max(6.5, maxLines * lineH + 2.2)
    ensureSpace(flow, rowHeight)

    for (let c = 0; c < colCount; c += 1) {
      const lines = cellLinesList[c]
      const x = getColX(c)
      const w = colWidths[c]

      setLanguage(flow.doc, flow.rtl, 8, false)
      flow.doc.setTextColor(51, 65, 85)

      if (flow.rtl) {
        writePdfText(flow.doc, lines, x + w - padding, flow.y + 3.5, { align: "right", lineHeightFactor: 1.15 }, true)
      } else {
        writePdfText(flow.doc, lines, x + padding, flow.y + 3.5, { align: "left", lineHeightFactor: 1.15 }, false)
      }
    }

    flow.y += rowHeight
    flow.doc.setDrawColor(226, 232, 240)
    flow.doc.setLineWidth(0.15)
    flow.doc.line(flow.x, flow.y - 0.5, flow.x + flow.width, flow.y - 0.5)
  }
  flow.y += 3
}

function renderTable(flow: Flow, block: Extract<PdfBlock, { type: "table" }>, sectionKey?: string) {
  if (sectionKey === "checklist") {
    renderChecklistTable(flow, block)
    return
  }

  const rawRows = (block && Array.isArray(block.rows)) ? block.rows : []
  if (!rawRows.length) return

  ensureSpace(flow, 16)
  setLanguage(flow.doc, flow.rtl, 8.5, false)

  const rawHeaders = block.headers ? [...block.headers] : []
  const rawBodyRows = rawRows.map((row) => [...row])

  if (flow.rtl) {
    if (rawHeaders.length) rawHeaders.reverse()
    rawBodyRows.forEach((r) => r.reverse())
  }

  renderNativeVectorTable(flow, rawHeaders, rawBodyRows)
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

async function renderBlocks(flow: Flow, blocks: PdfBlock[], sectionKey?: string) {
  for (const block of blocks) {
    if (block.type === "heading") renderHeading(flow, block)
    else if (block.type === "paragraph") renderParagraph(flow, block.text, { indent: (block as any).indent, bullet: (block as any).bullet })
    else if (block.type === "list") {
      for (let index = 0; index < block.items.length; index += 1) {
        renderParagraph(flow, block.items[index], { indent: 2, bullet: block.ordered ? `${index + 1}.` : "•" })
      }
    } else if (block.type === "table") renderTable(flow, block, sectionKey)
    else if (block.type === "image") await renderImageBlock(flow, block)
    else if (block.type === "spacer") flow.y += block.height
  }
}

function renderSectionTitle(flow: Flow, title: string) {
  ensureSpace(flow, 26)

  // Small space above section
  flow.y += 4

  // Gold bookmark icon (filled small square)
  const iconSize = 3.5
  const iconX = flow.rtl ? flow.x + flow.width - iconSize : flow.x
  flow.doc.setFillColor(180, 138, 32)
  flow.doc.rect(iconX, flow.y - 3, iconSize, iconSize, "F")

  // Section title text – larger, bolder, dark
  setLanguage(flow.doc, flow.rtl, 12, true)
  flow.doc.setTextColor(15, 23, 42)
  const textOffset = iconSize + 2
  const titleX = flow.rtl ? flow.x + flow.width - textOffset : flow.x + textOffset
  writePdfText(
    flow.doc,
    title,
    titleX,
    flow.y,
    { align: flow.rtl ? "right" : "left" },
    flow.rtl,
  )

  // Thin light separator line below
  flow.y += 3
  flow.doc.setDrawColor(226, 232, 240)
  flow.doc.setLineWidth(0.3)
  flow.doc.line(flow.x, flow.y, flow.x + flow.width, flow.y)
  flow.doc.setLineWidth(0.2)
  flow.y += 5
}

async function renderImageGrid(flow: Flow, images: NonNullable<PdfSectionTemplate["images"]>, sourceVisuals: boolean) {
  if (!images.length) {
    renderParagraph(flow, flow.rtl ? "لا توجد صور." : "No images recorded.")
    return
  }
  if (sourceVisuals) {
    for (const image of images) {
      await renderImageBlock(flow, { type: "image", ...image }, flow.width)
    }
    return
  }

  // 2-column side-by-side image grid
  const gap = 4
  const colWidth = (flow.width - gap) / 2
  const maxImgH = 68

  for (let i = 0; i < images.length; i += 2) {
    const pair = images.slice(i, i + 2)
    const loadedPair = await Promise.all(pair.map((img) => loadImage(img.src)))

    let rowH = 0
    const dimensions = loadedPair.map((img, idx) => {
      if (!img) return { w: colWidth, h: 40 }
      const ratio = Math.min(colWidth / img.width, maxImgH / img.height)
      const w = img.width * ratio
      const h = img.height * ratio
      rowH = Math.max(rowH, h + (pair[idx].caption ? 7 : 0) + 3)
      return { w, h }
    })

    ensureSpace(flow, rowH + 4)

    for (let idx = 0; idx < pair.length; idx += 1) {
      const img = loadedPair[idx]
      const block = pair[idx]
      const dim = dimensions[idx]
      const col = flow.rtl ? (pair.length === 1 ? 0 : 1 - idx) : idx
      const x = flow.x + col * (colWidth + gap)

      if (!img) {
        setLanguage(flow.doc, flow.rtl, 7.5, false)
        flow.doc.setTextColor(100, 116, 139)
        writePdfText(flow.doc, block.caption || (flow.rtl ? "تعذر تحميل الصورة." : "Image unavailable."), x, flow.y, { align: flow.rtl ? "right" : "left" }, flow.rtl)
        continue
      }

      flow.doc.setDrawColor(226, 232, 240)
      flow.doc.rect(x - 0.5, flow.y - 0.5, dim.w + 1, dim.h + 1)
      flow.doc.addImage(img.dataUrl, "JPEG", x, flow.y, dim.w, dim.h, undefined, "FAST")

      if (block.caption) {
        setLanguage(flow.doc, flow.rtl, 7.5, false)
        flow.doc.setTextColor(100, 116, 139)
        const capLines = textLines(flow.doc, block.caption, dim.w)
        writePdfText(flow.doc, capLines, flow.rtl ? x + dim.w : x, flow.y + dim.h + 2.5, {
          align: flow.rtl ? "right" : "left",
          lineHeightFactor: 1.1,
        }, flow.rtl)
      }
    }
    flow.y += rowH + 4
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
  doc.setFillColor(150, 112, 22)
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
  const profile = getOrganizationProfile()
  // Footer metadata is a fixed document element. It must never be sourced from
  // translated content or switched to Arabic fields for the Arabic export.
  const org = {
    name: profile.nameEn || "BONYAN CONSTRUCTION FOR ENGINEERING CONSULTANCY",
    crNumber: profile.crNumber,
    poBox: profile.poBox,
    postalCode: profile.postalCode,
    phones: profile.phones,
    email: profile.email,
    website: profile.website,
    address: profile.addressEn,
  }

  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)

    // ── Update Header Page Number (Right Column, Row 3) ─────────────────
    const headerTop = 4.5
    const headerH = 35
    const totalW = width - margin * 2
    const col1W = 50
    const col3W = 44
    const col2W = totalW - col1W - col3W
    const col3X = margin + col1W + col2W
    const rightX = col3X + col3W - 2.5
    const labelX  = col3X + 2.5
    const stepY = 4.0
    const startY = headerTop + 1.5 + 14.5
    const pageY = startY + 2 * stepY

    // Blank out old row 3 in column 3 area (light gray fill)
    doc.setFillColor(248, 250, 252)
    doc.rect(col3X + 0.5, pageY - 3, col3W - 1, 4.5, "F")

    const pageStr = `${page} / ${pages}`

    if (rtl) {
      // Arabic (RTL): Label on Right edge, Page number on Left edge
      setLanguage(doc, true, 6.5, false)
      doc.setTextColor(0, 0, 0)
      const shapedPageLabel = String(shapeArabicText(doc, "الصفحة:"))
      doc.text(shapedPageLabel, rightX, pageY, { align: "right" })

      setLanguage(doc, false, 7.5, true)
      doc.setTextColor(0, 0, 0)
      doc.text(pageStr, labelX, pageY, { align: "left" })
    } else {
      // English (LTR): Label on Left edge, Page number on Right edge
      setLanguage(doc, false, 6.5, false)
      doc.setTextColor(0, 0, 0)
      doc.text("Page:", labelX, pageY, { align: "left" })

      setLanguage(doc, false, 7.5, true)
      doc.setTextColor(0, 0, 0)
      doc.text(pageStr, rightX, pageY, { align: "right" })
    }

    // ── Footer Top Accent Line ──────────────────────────────────────────
    const footerTopY = height - 23.5
    doc.setFillColor(180, 138, 32)
    doc.rect(margin, footerTopY, width - margin * 2, 0.6, "F")

    // Left Column: Phones, Social/Website + Email on same line
    const socialHandle = org.website ? (org.website.startsWith("@") ? org.website : `@${org.website}`) : ""
    const socialAndEmail = [socialHandle, org.email].filter(Boolean).join(" · ")

    const contactLines = [
      org.phones ? `Tel: ${org.phones}` : "",
      socialAndEmail,
    ].filter(Boolean)

    if (contactLines.length) {
      setLanguage(doc, false, 6.5, false)
      doc.setTextColor(0, 0, 0)
      writePdfText(
        doc,
        contactLines,
        margin,
        footerTopY + 4,
        { align: "left", lineHeightFactor: 1.2 },
        false,
      )
    }

    // Right Column: English Registration Details & Address
    const enAddressLine1 = `C.R. No.: ${org.crNumber || "—"}, P.O. Box : ${org.poBox || "—"}, Postal Code : ${org.postalCode || "—"}`
    const enAddressLine2 = org.address || ""

    // Draw Line 1 (English CR/PO - right aligned, bold dark)
    setLanguage(doc, false, 6.5, true)
    doc.setTextColor(0, 0, 0)
    doc.text(enAddressLine1, width - margin, footerTopY + 4, { align: "right" })

    // Draw Line 2 (English Address - right aligned)
    if (enAddressLine2) {
      setLanguage(doc, false, 6.5, false)
      doc.setTextColor(0, 0, 0)
      doc.text(enAddressLine2, width - margin, footerTopY + 8, { align: "right" })
    }

    // Sub-Footer Divider Line
    const subFooterDividerY = footerTopY + 12.7
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.15)
    doc.line(margin, subFooterDividerY, width - margin, subFooterDividerY)

    // Sub-Footer Left: Company Name
    const subFooterTextY = subFooterDividerY + 3.2
    setLanguage(doc, false, 6, false)
    doc.setTextColor(0, 0, 0)
    doc.text(org.name.toUpperCase(), margin, subFooterTextY, { align: "left" })

    // Sub-Footer Right: Page Number
    setLanguage(doc, false, 6, false)
    doc.setTextColor(0, 0, 0)
    doc.text(`Page ${page} / ${pages}`, width - margin, subFooterTextY, { align: "right" })
  }
  if (rtl) setLanguage(doc, true, 8, false)
}

type StructuredPdfTable = NonNullable<PdfSectionTemplate["table"]>

function parsePdfHtmlRoot(html: string | undefined) {
  const documentNode = new DOMParser().parseFromString(`<div id="pdf-table-root">${html ?? ""}</div>`, "text/html")
  return documentNode.getElementById("pdf-table-root")
}

function tableCellTextWithoutNestedTables(cell: Element | undefined) {
  if (!cell) return ""
  const clone = cell.cloneNode(true) as Element
  clone.querySelectorAll("table").forEach((table) => table.remove())
  clone.querySelectorAll("br").forEach((node) => node.replaceWith("\n"))
  return normalizeText(clone.textContent || "")
}

function directTableRows(table: Element) {
  return Array.from(table.querySelectorAll("tr")).filter((row) => row.closest("table") === table)
}

function directTableCells(row: Element) {
  const table = row.closest("table")
  return Array.from(row.children).filter((child) => {
    const tag = child.tagName.toLowerCase()
    return (tag === "th" || tag === "td") && child.closest("table") === table
  })
}

function topLevelTables(container: Element) {
  return Array.from(container.querySelectorAll("table")).filter((table) => {
    const ancestorTable = table.parentElement?.closest("table")
    return !ancestorTable || !container.contains(ancestorTable)
  })
}

function directCaption(table: Element) {
  return Array.from(table.children).find((child) => child.tagName.toLowerCase() === "caption")
}

function textNodesOutsideNestedTables(root: Element) {
  const nodes: Text[] = []
  const visit = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        nodes.push(child as Text)
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const element = child as Element
      if (element.tagName.toLowerCase() === "table") continue
      visit(element)
    }
  }
  visit(root)
  return nodes
}

function replaceCellTextPreservingStructure(cell: Element, translatedCell?: Element) {
  const translatedText = tableCellTextWithoutNestedTables(translatedCell)
  const textNodes = textNodesOutsideNestedTables(cell)
  const target = textNodes.find((node) => Boolean(node.nodeValue?.trim())) ?? textNodes[0]

  textNodes.forEach((node) => {
    node.nodeValue = ""
  })

  if (!translatedText) return
  if (target) {
    target.nodeValue = translatedText
    return
  }

  const firstNonTableChild = Array.from(cell.children)
    .find((child) => child.tagName.toLowerCase() !== "table")
  const textNode = cell.ownerDocument.createTextNode(translatedText)
  if (firstNonTableChild) firstNonTableChild.insertBefore(textNode, firstNonTableChild.firstChild)
  else cell.insertBefore(textNode, cell.firstChild)
}

function synchronizeTableCell(sourceCell: Element, synchronizedCell: Element, translatedCell?: Element) {
  replaceCellTextPreservingStructure(synchronizedCell, translatedCell)

  const sourceNestedTables = topLevelTables(sourceCell)
  const synchronizedNestedTables = topLevelTables(synchronizedCell)
  const translatedNestedTables = translatedCell ? topLevelTables(translatedCell) : []

  sourceNestedTables.forEach((sourceNestedTable, index) => {
    const currentNestedTable = synchronizedNestedTables[index]
    if (!currentNestedTable) return
    currentNestedTable.replaceWith(synchronizedTableElement(sourceNestedTable, translatedNestedTables[index]))
  })
}

function synchronizedTableElement(sourceTable: Element, translatedTable?: Element) {
  const synchronized = sourceTable.cloneNode(true) as Element
  const sourceRows = directTableRows(sourceTable)
  const synchronizedRows = directTableRows(synchronized)
  const translatedRows = translatedTable ? directTableRows(translatedTable) : []

  sourceRows.forEach((sourceRow, rowIndex) => {
    const synchronizedRow = synchronizedRows[rowIndex]
    if (!synchronizedRow) return
    const sourceCells = directTableCells(sourceRow)
    const synchronizedCells = directTableCells(synchronizedRow)
    const translatedCells = translatedRows[rowIndex] ? directTableCells(translatedRows[rowIndex]) : []

    sourceCells.forEach((sourceCell, cellIndex) => {
      const synchronizedCell = synchronizedCells[cellIndex]
      if (!synchronizedCell) return
      synchronizeTableCell(sourceCell, synchronizedCell, translatedCells[cellIndex])
    })
  })

  const synchronizedCaption = directCaption(synchronized)
  if (synchronizedCaption) {
    synchronizedCaption.textContent = tableCellTextWithoutNestedTables(
      translatedTable ? directCaption(translatedTable) : undefined,
    )
  }
  return synchronized
}

function attachmentRegionMap(root: Element) {
  const regions = Array.from(root.querySelectorAll("section[data-attachment-id]"))
  const map = new Map<string, Element>()
  const hasRootTables = topLevelTables(root)
    .some((table) => !table.closest("section[data-attachment-id]"))
  if (!regions.length || hasRootTables) map.set("__root__", root)
  regions.forEach((region) => {
    map.set(region.getAttribute("data-attachment-id") || "__root__", region)
  })
  return map
}

function regionTopLevelTables(region: Element, key: string) {
  return topLevelTables(region).filter((table) => {
    const attachmentRegion = table.closest("section[data-attachment-id]")
    return key === "__root__" ? !attachmentRegion : attachmentRegion === region
  })
}

function findDataSection(root: Element, attribute: "data-attachment-id" | "data-source-page", value: string) {
  return Array.from(root.querySelectorAll(`section[${attribute}]`))
    .find((section) => section.getAttribute(attribute) === value)
}

function ensureTargetRegion(targetRoot: Element, sourceRegion: Element, key: string) {
  if (key === "__root__") return targetRoot
  const existing = findDataSection(targetRoot, "data-attachment-id", key)
  if (existing) return existing

  const region = targetRoot.ownerDocument.createElement("section")
  region.setAttribute("data-attachment-id", key)
  const sourceHeading = sourceRegion.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > h4")
  if (sourceHeading) {
    const heading = targetRoot.ownerDocument.createElement(sourceHeading.tagName.toLowerCase())
    heading.textContent = sourceHeading.textContent || ""
    region.appendChild(heading)
  }
  targetRoot.appendChild(region)
  return region
}

function sourceTableContainer(sourceTable: Element, sourceRegion: Element, targetRegion: Element) {
  const sourcePage = sourceTable.closest("section[data-source-page]")
  if (!sourcePage || !sourceRegion.contains(sourcePage)) return targetRegion
  const pageNumber = sourcePage.getAttribute("data-source-page") || ""
  const existing = findDataSection(targetRegion, "data-source-page", pageNumber)
  if (existing) return existing
  const page = targetRegion.ownerDocument.createElement("section")
  page.setAttribute("data-source-page", pageNumber)
  targetRegion.appendChild(page)
  return page
}

function sourcePageKey(table: Element) {
  return table.closest("section[data-source-page]")?.getAttribute("data-source-page") ?? "flow"
}

function translatedTableForSource(input: {
  sourceTable: Element
  sourceTables: Element[]
  translatedTables: Element[]
  used: Set<Element>
}) {
  const sourcePage = sourcePageKey(input.sourceTable)
  const sourcePageTables = input.sourceTables.filter((table) => sourcePageKey(table) === sourcePage)
  const pageOrdinal = sourcePageTables.indexOf(input.sourceTable)
  const samePage = input.translatedTables.filter((table) => sourcePageKey(table) === sourcePage && !input.used.has(table))
  const candidate = samePage[pageOrdinal] ?? input.translatedTables.find((table) => !input.used.has(table))
  if (candidate) input.used.add(candidate)
  return candidate
}

function reorderSourcePages(sourceRegion: Element, targetRegion: Element) {
  const sourcePages = Array.from(sourceRegion.querySelectorAll("section[data-source-page]"))
    .filter((page) => page.closest("section[data-attachment-id]") === sourceRegion.closest("section[data-attachment-id]"))
  sourcePages.forEach((sourcePage) => {
    const pageNumber = sourcePage.getAttribute("data-source-page") || ""
    const targetPage = findDataSection(targetRegion, "data-source-page", pageNumber)
    if (targetPage) targetRegion.appendChild(targetPage)
  })
}

function synchronizeHtmlTableStructures(sourceHtml: string | undefined, translatedHtml: string | undefined) {
  const sourceRoot = parsePdfHtmlRoot(sourceHtml)
  const translatedRoot = parsePdfHtmlRoot(translatedHtml)
  if (!sourceRoot || !translatedRoot) return ""

  const sourceRegions = attachmentRegionMap(sourceRoot)
  const translatedRegions = attachmentRegionMap(translatedRoot)
  const orderedTargetRegions: Element[] = []

  for (const [key, sourceRegion] of sourceRegions) {
    const targetRegion = translatedRegions.get(key) ?? ensureTargetRegion(translatedRoot, sourceRegion, key)
    const sourceTables = regionTopLevelTables(sourceRegion, key)
    const translatedTables = regionTopLevelTables(targetRegion, key)
    const usedTranslatedTables = new Set<Element>()

    sourceTables.forEach((sourceTable) => {
      const translatedTable = translatedTableForSource({
        sourceTable,
        sourceTables,
        translatedTables,
        used: usedTranslatedTables,
      })
      const synchronized = synchronizedTableElement(sourceTable, translatedTable)
      const targetContainer = sourceTableContainer(sourceTable, sourceRegion, targetRegion)
      if (translatedTable && targetContainer.contains(translatedTable)) {
        translatedTable.replaceWith(synchronized)
      } else {
        translatedTable?.remove()
        targetContainer.appendChild(synchronized)
      }
    })

    translatedTables
      .filter((table) => !usedTranslatedTables.has(table))
      .forEach((table) => table.remove())

    reorderSourcePages(sourceRegion, targetRegion)
    if (key !== "__root__") orderedTargetRegions.push(targetRegion)
  }

  for (const [key, region] of translatedRegions) {
    if (!sourceRegions.has(key)) region.querySelectorAll("table").forEach((table) => table.remove())
  }

  orderedTargetRegions.forEach((region) => translatedRoot.appendChild(region))
  return translatedRoot.innerHTML
}

const STRUCTURAL_BLOCK_SELECTOR = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "blockquote", "address", "figcaption", "div", "article",
  "li", "dt", "dd", "table",
].join(",")

function closestAttachmentRegion(element: Element) {
  return element.closest("section[data-attachment-id]")
}

function regionStructuralBlocks(region: Element, key: string) {
  return Array.from(region.querySelectorAll(STRUCTURAL_BLOCK_SELECTOR)).filter((element) => {
    const attachmentRegion = closestAttachmentRegion(element)
    if (key === "__root__") {
      if (attachmentRegion) return false
    } else if (attachmentRegion !== region) {
      return false
    }

    // Table structure and text are synchronized as a single block. Do not also
    // treat headings/paragraphs nested inside a table as independent blocks.
    if (element.tagName.toLowerCase() !== "table" && element.closest("table")) return false

    const tag = element.tagName.toLowerCase()
    if ((tag === "div" || tag === "article") && element.querySelector(STRUCTURAL_BLOCK_SELECTOR)) return false

    // A list item's source structure is canonical. Descendant paragraphs are
    // not treated as separate blocks, otherwise one translated item could be
    // consumed twice.
    const parentListItem = element.parentElement?.closest("li,dt,dd")
    if (parentListItem && parentListItem !== element) return false
    return true
  })
}

function structuralBlockKind(element: Element) {
  const tag = element.tagName.toLowerCase()
  if (tag === "table") return "table"
  if (/^h[1-6]$/.test(tag)) return "heading"
  if (tag === "li" || tag === "dt" || tag === "dd") return "list-item"
  if (tag === "figcaption") return "caption"
  return "prose"
}

function translatedBlockForSource(input: {
  sourceBlock: Element
  sourceBlocks: Element[]
  translatedBlocks: Element[]
  used: Set<Element>
}) {
  const kind = structuralBlockKind(input.sourceBlock)
  const sourcePage = sourcePageKey(input.sourceBlock)
  const sameKindSource = input.sourceBlocks.filter((block) => structuralBlockKind(block) === kind && sourcePageKey(block) === sourcePage)
  const pageOrdinal = sameKindSource.indexOf(input.sourceBlock)
  const exactPage = input.translatedBlocks.filter((block) =>
    structuralBlockKind(block) === kind
    && sourcePageKey(block) === sourcePage
    && !input.used.has(block),
  )
  const sameTag = input.translatedBlocks.filter((block) =>
    block.tagName.toLowerCase() === input.sourceBlock.tagName.toLowerCase()
    && !input.used.has(block),
  )
  const sameKind = input.translatedBlocks.filter((block) =>
    structuralBlockKind(block) === kind
    && !input.used.has(block),
  )
  const candidate = exactPage[pageOrdinal]
    ?? exactPage[0]
    ?? sameTag[0]
    ?? sameKind[0]
  if (candidate) input.used.add(candidate)
  return candidate
}

function blockTextWithoutNestedStructures(element: Element | undefined) {
  if (!element) return ""
  const clone = element.cloneNode(true) as Element
  clone.querySelectorAll("table,ul,ol,dl").forEach((nested) => nested.remove())
  clone.querySelectorAll("br").forEach((node) => node.replaceWith("\n"))
  return normalizeText(clone.textContent || "")
}

function blockTextNodes(target: Element) {
  const nodes: Text[] = []
  const visit = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        nodes.push(child as Text)
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const element = child as Element
      if (["table", "ul", "ol", "dl"].includes(element.tagName.toLowerCase())) continue
      visit(element)
    }
  }
  visit(target)
  return nodes
}

function replaceBlockTextPreservingStructure(target: Element, translated?: Element) {
  const translatedText = blockTextWithoutNestedStructures(translated)
  const textNodes = blockTextNodes(target)
  const targetNode = textNodes.find((node) => Boolean(node.nodeValue?.trim())) ?? textNodes[0]
  textNodes.forEach((node) => {
    node.nodeValue = ""
  })
  if (!translatedText) return
  if (targetNode) {
    targetNode.nodeValue = translatedText
    return
  }
  target.insertBefore(target.ownerDocument.createTextNode(translatedText), target.firstChild)
}

function directMeaningfulTextNodes(element: Element) {
  return Array.from(element.childNodes)
    .filter((node): node is Text => node.nodeType === Node.TEXT_NODE && Boolean(node.nodeValue?.trim()))
}

function mirrorDirectRegionText(source: Element, target: Element, translated?: Element) {
  const sourceNodes = directMeaningfulTextNodes(source)
  const targetNodes = directMeaningfulTextNodes(target)
  const translatedNodes = translated ? directMeaningfulTextNodes(translated) : []
  sourceNodes.forEach((_, index) => {
    const targetNode = targetNodes[index]
    if (targetNode) targetNode.nodeValue = translatedNodes[index]?.nodeValue?.trim() ?? ""
  })
}

function cloneRegionWithMirroredContent(sourceRegion: Element, translatedRegion: Element | undefined, key: string) {
  const synchronizedRegion = sourceRegion.cloneNode(true) as Element
  const sourceBlocks = regionStructuralBlocks(sourceRegion, key)
  const synchronizedBlocks = regionStructuralBlocks(synchronizedRegion, key)
  const translatedBlocks = translatedRegion ? regionStructuralBlocks(translatedRegion, key) : []
  const usedTranslatedBlocks = new Set<Element>()
  mirrorDirectRegionText(sourceRegion, synchronizedRegion, translatedRegion)

  sourceBlocks.forEach((sourceBlock, index) => {
    const synchronizedBlock = synchronizedBlocks[index]
    if (!synchronizedBlock) return
    const translatedBlock = translatedBlockForSource({
      sourceBlock,
      sourceBlocks,
      translatedBlocks,
      used: usedTranslatedBlocks,
    })
    if (sourceBlock.tagName.toLowerCase() === "table") {
      synchronizedBlock.replaceWith(synchronizedTableElement(sourceBlock, translatedBlock))
      return
    }
    replaceBlockTextPreservingStructure(synchronizedBlock, translatedBlock)
  })

  return synchronizedRegion
}

/**
 * Mirrors the complete English document structure into the translated HTML.
 * English remains the canonical layout source; Arabic contributes text only.
 * This keeps sections, source pages, headings, rows, columns, merged cells and
 * ordering identical, while translated-only blocks cannot drift into the PDF.
 */
function synchronizeHtmlDocumentStructure(sourceHtml: string | undefined, translatedHtml: string | undefined) {
  if (!sourceHtml?.trim()) return ""
  const sourceRoot = parsePdfHtmlRoot(sourceHtml)
  const tableSynchronizedRoot = parsePdfHtmlRoot(synchronizeHtmlTableStructures(sourceHtml, translatedHtml))
  if (!sourceRoot || !tableSynchronizedRoot) return ""

  const synchronizedRoot = sourceRoot.cloneNode(true) as Element
  const sourceRegions = attachmentRegionMap(sourceRoot)
  const translatedRegions = attachmentRegionMap(tableSynchronizedRoot)
  const synchronizedRegions = attachmentRegionMap(synchronizedRoot)

  for (const [key, sourceRegion] of sourceRegions) {
    const synchronizedRegion = synchronizedRegions.get(key)
    if (!synchronizedRegion) continue
    const mirrored = cloneRegionWithMirroredContent(sourceRegion, translatedRegions.get(key), key)
    if (key === "__root__") {
      synchronizedRoot.innerHTML = mirrored.innerHTML
    } else {
      synchronizedRegion.replaceWith(mirrored)
    }
  }

  return synchronizedRoot.innerHTML
}

function synchronizeStructuredTable(source: StructuredPdfTable | undefined, translated: StructuredPdfTable | undefined) {
  if (!source) return undefined
  return {
    headers: source.headers.map((_, column) => translated?.headers?.[column] ?? ""),
    rows: source.rows.map((sourceRow, row) =>
      sourceRow.map((_, column) => translated?.rows?.[row]?.[column] ?? ""),
    ),
  }
}

function imageStructureKey(image: PdfImageTemplate) {
  return [
    image.sourcePage ?? 0,
    image.sourceOrder ?? 0,
    image.flowTarget ?? "gallery",
    image.sectionKey ?? "",
  ].join(":")
}

function synchronizeSectionImages(source: PdfImageTemplate[] | undefined, translated: PdfImageTemplate[] | undefined) {
  if (!source?.length) return undefined
  const translatedByKey = new Map((translated ?? []).map((image) => [imageStructureKey(image), image]))
  return source.map((image, index) => ({
    ...image,
    caption: translatedByKey.get(imageStructureKey(image))?.caption ?? translated?.[index]?.caption ?? "",
  }))
}

function synchronizeMirroredDocumentStructures(english: LanguagePdfTemplate, arabic: LanguagePdfTemplate) {
  const arabicSections = new Map(arabic.sections.map((section) => [section.key, section]))
  return {
    ...arabic,
    // The English template is the canonical document schema. Arabic supplies
    // translated labels/text only, never an independent section hierarchy.
    sections: english.sections.map((source) => {
      const translated = arabicSections.get(source.key)
      const sourceDocumentHtml = synchronizeHtmlDocumentStructure(source.sourceDocumentHtml, translated?.sourceDocumentHtml)
      const otherDocumentsHtml = synchronizeHtmlDocumentStructure(source.otherDocumentsHtml, translated?.otherDocumentsHtml)
      return {
        ...source,
        title: translated?.title ?? source.title,
        imageTitle: translated?.imageTitle ?? source.imageTitle,
        documentsTitle: translated?.documentsTitle ?? source.documentsTitle,
        html: synchronizeHtmlDocumentStructure(source.html, translated?.html),
        table: synchronizeStructuredTable(source.table, translated?.table),
        images: synchronizeSectionImages(source.images, translated?.images),
        sourceDocumentHtml,
        otherDocumentsHtml,
        documentsHtml: `${sourceDocumentHtml}${otherDocumentsHtml}`,
      }
    }),
  }
}

function tableStructureSignature(table: Element): string {
  const caption = directCaption(table) ? "caption:1" : "caption:0"
  const rows = directTableRows(table).map((row) => {
    const group = row.parentElement?.tagName.toLowerCase() ?? "table"
    const cells = directTableCells(row).map((cell) => {
      const tag = cell.tagName.toLowerCase()
      const colSpan = Math.max(1, Number.parseInt(cell.getAttribute("colspan") || "1", 10) || 1)
      const rowSpan = Math.max(1, Number.parseInt(cell.getAttribute("rowspan") || "1", 10) || 1)
      const nested = topLevelTables(cell).map((nestedTable) => tableStructureSignature(nestedTable)).join("&")
      return `${tag}:${colSpan}:${rowSpan}${nested ? `{${nested}}` : ""}`
    }).join(",")
    return `${group}[${cells}]`
  }).join(";")
  return `${caption}|${rows}`
}

function htmlTableStructureSignatures(html: string | undefined) {
  const root = parsePdfHtmlRoot(html)
  if (!root) return []
  return topLevelTables(root).map((table) => {
    const attachmentId = table.closest("section[data-attachment-id]")?.getAttribute("data-attachment-id") ?? "root"
    const sourcePage = table.closest("section[data-source-page]")?.getAttribute("data-source-page") ?? "flow"
    return `${attachmentId}:${sourcePage}:${tableStructureSignature(table)}`
  })
}

const DOCUMENT_STRUCTURE_SELECTOR = [
  "section[data-attachment-id]",
  "section[data-source-page]",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "blockquote", "address", "figure", "figcaption", "div", "article",
  "ul", "ol", "dl", "li", "dt", "dd", "table",
].join(",")

function htmlDocumentStructureSignatures(html: string | undefined) {
  const root = parsePdfHtmlRoot(html)
  if (!root) return []
  return Array.from(root.querySelectorAll(DOCUMENT_STRUCTURE_SELECTOR))
    .filter((element) => {
      if (element.tagName.toLowerCase() === "table") return !element.parentElement?.closest("table")
      return !element.closest("table")
    })
    .map((element) => {
      const tag = element.tagName.toLowerCase()
      const attachmentId = element.getAttribute("data-attachment-id")
        ?? element.closest("section[data-attachment-id]")?.getAttribute("data-attachment-id")
        ?? "root"
      const sourcePage = element.getAttribute("data-source-page")
        ?? element.closest("section[data-source-page]")?.getAttribute("data-source-page")
        ?? "flow"
      if (tag === "table") return `${attachmentId}:${sourcePage}:table:${tableStructureSignature(element)}`
      const listCount = tag === "ul" || tag === "ol" || tag === "dl"
        ? Array.from(element.children).filter((child) => ["li", "dt", "dd"].includes(child.tagName.toLowerCase())).length
        : 0
      return `${attachmentId}:${sourcePage}:${tag}:${listCount}`
    })
}

function templateDocumentStructureSignatures(template: LanguagePdfTemplate) {
  return template.sections.flatMap((section) => {
    const signatures: string[] = [`${section.key}:section`]
    htmlDocumentStructureSignatures(section.html).forEach((signature, index) => signatures.push(`${section.key}:html:${index}:${signature}`))
    const sourceHtml = section.sourceDocumentHtml ?? (section.otherDocumentsHtml === undefined ? section.documentsHtml : undefined)
    htmlDocumentStructureSignatures(sourceHtml).forEach((signature, index) => signatures.push(`${section.key}:source:${index}:${signature}`))
    htmlDocumentStructureSignatures(section.otherDocumentsHtml).forEach((signature, index) => signatures.push(`${section.key}:other:${index}:${signature}`))
    return signatures
  })
}

function structuredTableSignature(table: StructuredPdfTable | undefined) {
  if (!table) return null
  const header = table.headers.map(() => "th:1:1").join(",")
  const rows = table.rows.map((row) => row.map(() => "td:1:1").join(",")).join(";")
  return `${header}|${rows}`
}

function templateTableStructureSignatures(template: LanguagePdfTemplate) {
  return template.sections.flatMap((section) => {
    const signatures: string[] = []
    const structured = structuredTableSignature(section.table)
    if (structured) signatures.push(`${section.key}:structured:${structured}`)
    htmlTableStructureSignatures(section.html).forEach((signature, index) => signatures.push(`${section.key}:html:${index}:${signature}`))
    const sourceHtml = section.sourceDocumentHtml ?? (section.otherDocumentsHtml === undefined ? section.documentsHtml : undefined)
    htmlTableStructureSignatures(sourceHtml).forEach((signature, index) => signatures.push(`${section.key}:source:${index}:${signature}`))
    htmlTableStructureSignatures(section.otherDocumentsHtml).forEach((signature, index) => signatures.push(`${section.key}:other:${index}:${signature}`))
    return signatures
  })
}

function countHtmlTables(html: string | undefined) {
  return html ? (html.match(/<table\b/gi) ?? []).length : 0
}

function textLengthFromHtml(html: string | undefined) {
  return html ? normalizeText(html.replace(/<[^>]+>/g, " ")).length : 0
}

function templateInventory(template: LanguagePdfTemplate) {
  return template.sections.reduce((inventory, section) => {
    const hasTable = Boolean(section.table && Array.isArray(section.table.rows) && section.table.rows.length > 0)
    inventory.tables += hasTable ? 1 : 0
    inventory.tables += countHtmlTables(section.html) + countHtmlTables(section.documentsHtml)
    inventory.images += section.images?.length ?? 0
    inventory.text += section.title ? section.title.length : 0
    inventory.text += textLengthFromHtml(section.html) + textLengthFromHtml(section.documentsHtml)
    if (hasTable && section.table?.rows) {
      inventory.text += section.table.rows.flat().join(" ").length
    }
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
  const englishDocumentStructures = templateDocumentStructureSignatures(english)
  const arabicDocumentStructures = templateDocumentStructureSignatures(arabic)
  if (englishDocumentStructures.join("|") !== arabicDocumentStructures.join("|")) {
    throw new Error("English and Arabic PDF document structures are not synchronized.")
  }
  const englishTableStructures = templateTableStructureSignatures(english)
  const arabicTableStructures = templateTableStructureSignatures(arabic)
  if (englishTableStructures.join("|") !== arabicTableStructures.join("|")) {
    throw new Error("English and Arabic PDF table structures are not synchronized.")
  }
  if (imageFlowSignature(english).join("|") !== imageFlowSignature(arabic).join("|")) {
    throw new Error("English and Arabic PDF image placement is not synchronized.")
  }
}

async function buildLanguagePdfBlob(
  template: LanguagePdfTemplate,
  options: { appendClosingBlock?: boolean } = {},
) {
  validateLanguagePdfTemplate(template)
  const profile = await fetchOrganizationProfileFromDb()
  const pdfHeaderLogoSource = profile.pdfHeaderLogoUrl || "/LogoB.png"
  const closingLogoSource = profile.pdfLogoUrl || CLOSING_LOGO_URL
  const [JsPdf, logoImage, closingLogoImage] = await Promise.all([
    loadPdfTools(),
    loadImage(pdfHeaderLogoSource),
    options.appendClosingBlock ? loadImage(closingLogoSource) : Promise.resolve(null),
  ])
  const doc = new JsPdf({
    unit: "mm",
    format: "a4",
    orientation: "portrait",
    compress: true,
    putOnlyUsedFonts: true,
  })
  await installFonts(doc)
  if (template.language === "ar") {
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
    closingLogoImage,
  }
  drawFirstPageHeader(flow)
  for (const section of template.sections) {
    // Skip redundant Project Information & Report Details tables since the executive metadata card at top presents this data
    const titleLower = section.title.toLowerCase()
    const isRedundantSection = section.key === "projectInformation"
      || section.key === "project-info"
      || section.key === "reportDetails"
      || section.key === "report-details"
      || titleLower.includes("project information")
      || titleLower.includes("report details")
      || section.title.includes("معلومات المشروع")
      || section.title.includes("تفاصيل التقرير")

    if (isRedundantSection) {
      continue
    }

    const sectionFlowImages = (section.images ?? []).filter((image) => image.flowTarget === "section")
    const galleryImages = (section.images ?? []).filter((image) => image.flowTarget !== "section" && image.flowTarget !== "documents")
    const contentBlocks = section.html !== undefined ? htmlToBlocks(section.html) : []
    if (section.table && Array.isArray(section.table.rows) && section.table.rows.length > 0) {
      contentBlocks.push({ type: "table", ...section.table })
    }
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
      await renderBlocks(flow, flowedContent, section.key)
    }

    if (section.documentsTitle && hasDocuments) {
      renderHeading(flow, { type: "heading", level: 3, text: section.documentsTitle })
      if (reconstructedSource.length) await renderBlocks(flow, reconstructedSource, section.key)
      if (otherDocumentBlocks.length) await renderBlocks(flow, otherDocumentBlocks, section.key)
    }

    if (hasGalleryImages) {
      if (section.imageTitle) {
        renderHeading(flow, { type: "heading", level: 3, text: section.imageTitle })
      }
      await renderImageGrid(flow, galleryImages, section.key === "source-visuals")
    }

    flow.y += 4
  }

  if (options.appendClosingBlock) {
    renderTranslationClosingBlock(flow)
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
    return canvas.toDataURL("image/jpeg", 0.92)
  } finally {
    page.cleanup?.()
  }
}

function drawComposedPdfPage(
  doc: JsPdfDocument,
  dataUrl: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const imageProperties = doc.getImageProperties(dataUrl)
  const ratio = Math.min(width / imageProperties.width, height / imageProperties.height)
  const renderedWidth = imageProperties.width * ratio
  const renderedHeight = imageProperties.height * ratio
  doc.addImage(
    dataUrl,
    "JPEG",
    x + (width - renderedWidth) / 2,
    y + (height - renderedHeight) / 2,
    renderedWidth,
    renderedHeight,
    undefined,
    "FAST",
  )
}

/**
 * Builds the bilingual export strictly as a visual page composer.
 *
 * The existing English and Arabic PDF generators remain the only content
 * renderers. Their completed pages are paired side-by-side without rebuilding
 * text, tables, images, headers, footers, or pagination. A3 landscape is
 * exactly two A4 portrait pages wide, so paired pages preserve their original
 * proportions. Unmatched trailing pages remain full-size A4 pages.
 */
async function buildPageComposedBilingualPdfBlob(input: {
  data: StageTranslationPageData
  englishBlob: Blob
  arabicBlob: Blob
}) {
  const { data, englishBlob, arabicBlob } = input
  const JsPdf = await loadPdfTools()
  const [englishPdf, arabicPdf] = await Promise.all([
    openPdfBlob(englishBlob),
    openPdfBlob(arabicBlob),
  ])

  const englishPages = Number(englishPdf.documentProxy.numPages || 0)
  const arabicPages = Number(arabicPdf.documentProxy.numPages || 0)
  const totalPages = Math.max(englishPages, arabicPages)
  if (!totalPages) {
    await Promise.allSettled([
      englishPdf.loadingTask.destroy?.(),
      arabicPdf.loadingTask.destroy?.(),
    ])
    throw new Error("The English and Arabic PDFs contain no pages to compose.")
  }

  // A3 landscape = two A4 portrait pages placed side-by-side at their native
  // physical aspect ratio. If one PDF has no matching page, the output page is
  // a normal A4 portrait page containing the remaining original page.
  const firstPageIsPaired = englishPages > 0 && arabicPages > 0
  const doc = new JsPdf({
    unit: "mm",
    format: firstPageIsPaired ? "a3" : "a4",
    orientation: firstPageIsPaired ? "landscape" : "portrait",
    compress: true,
  })

  try {
    for (let index = 0; index < totalPages; index += 1) {
      const englishPageNumber = index + 1 <= englishPages ? index + 1 : null
      const arabicPageNumber = index + 1 <= arabicPages ? index + 1 : null
      const paired = englishPageNumber !== null && arabicPageNumber !== null

      if (index > 0) {
        doc.addPage(paired ? "a3" : "a4", paired ? "landscape" : "portrait")
      }

      if (paired) {
        const [englishImage, arabicImage] = await Promise.all([
          renderPdfPage(englishPdf.documentProxy, englishPageNumber, 1800),
          renderPdfPage(arabicPdf.documentProxy, arabicPageNumber, 1800),
        ])
        drawComposedPdfPage(doc, englishImage, 0, 0, PAGE.portraitWidth, PAGE.portraitHeight)
        drawComposedPdfPage(doc, arabicImage, PAGE.portraitWidth, 0, PAGE.portraitWidth, PAGE.portraitHeight)
        continue
      }

      const remainingImage = englishPageNumber !== null
        ? await renderPdfPage(englishPdf.documentProxy, englishPageNumber, 1800)
        : await renderPdfPage(arabicPdf.documentProxy, arabicPageNumber as number, 1800)
      drawComposedPdfPage(doc, remainingImage, 0, 0, PAGE.portraitWidth, PAGE.portraitHeight)
    }

    doc.setProperties({
      title: `${data.response.reportTitle} — Bilingual`,
      subject: data.response.subject || data.term.name,
      author: data.project.name,
      creator: "BuildSight AI Document Translation",
    })
    return doc.output("blob") as Blob
  } finally {
    await Promise.allSettled([
      englishPdf.loadingTask.destroy?.(),
      arabicPdf.loadingTask.destroy?.(),
    ])
  }
}

function drawPageImage(doc: JsPdfDocument, dataUrl: string | undefined, x: number, y: number, width: number, height: number, empty: string) {
  doc.setDrawColor(148, 163, 184)
  doc.setFillColor(255, 255, 255)
  doc.rect(x, y, width, height, "FD")
  if (!dataUrl) {
    doc.setFont(LATIN_FONT_FAMILY, "normal")
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
}) {
  const { doc, data, margin } = input
  const width = PAGE.portraitWidth
  doc.setFillColor(150, 112, 22)
  doc.rect(0, 0, width, 3, "F")
  const projectNameIsArabic = containsArabic(data.project.name)
  setLanguage(doc, projectNameIsArabic, 11, true)
  doc.setTextColor(15, 23, 42)
  writePdfText(doc, data.project.name, projectNameIsArabic ? width - margin : margin, 10, {
    align: projectNameIsArabic ? "right" : "left",
  }, projectNameIsArabic)
  const reportHeader = `${data.response.reportNumber} · ${data.term.name}`
  const reportHeaderIsArabic = containsArabic(reportHeader)
  setLanguage(doc, reportHeaderIsArabic, 8, false)
  doc.setTextColor(100, 116, 139)
  writePdfText(doc, reportHeader, projectNameIsArabic ? margin : width - margin, 10, { align: projectNameIsArabic ? "left" : "right" }, reportHeaderIsArabic)

  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.3)
  doc.line(margin, 14, width - margin, 14)
  doc.setLineWidth(0.2)
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

type BilingualRowStyle = "column-header" | "section" | "heading" | "body" | "table-header" | "table-cell"

type BilingualRowOptions = {
  style?: BilingualRowStyle
  alternate?: boolean
  groupEnd?: boolean
}

function bilingualCellLines(
  doc: JsPdfDocument,
  text: string | undefined,
  width: number,
  rtl: boolean,
  fontSize: number,
  bold: boolean,
) {
  const value = normalizeText(text || "")
  if (!value) return [] as string[]
  const hasArabic = containsArabic(value)
  setLanguage(doc, rtl || hasArabic, fontSize, bold)
  const split = doc.splitTextToSize(value, Math.max(8, width))
  return Array.isArray(split) ? split.map(String) : [String(split)]
}

function bilingualRowAppearance(style: BilingualRowStyle, alternate: boolean) {
  if (style === "column-header") {
    return {
      fontSize: 9,
      bold: true,
      lineHeight: 4.8,
      padding: 2.2,
      minHeight: 9,
      fill: [180, 138, 32] as const,
      text: [255, 255, 255] as const,
      border: [180, 138, 32] as const,
    }
  }
  if (style === "section") {
    return {
      fontSize: 11,
      bold: true,
      lineHeight: 5.4,
      padding: 2.6,
      minHeight: 11,
      fill: [253, 248, 235] as const,
      text: [15, 23, 42] as const,
      border: [225, 200, 140] as const,
    }
  }
  if (style === "heading") {
    return {
      fontSize: 9.5,
      bold: true,
      lineHeight: 4.8,
      padding: 2.2,
      minHeight: 8.5,
      fill: [248, 250, 252] as const,
      text: [15, 23, 42] as const,
      border: [203, 213, 225] as const,
    }
  }
  if (style === "table-header") {
    return {
      fontSize: 8.2,
      bold: true,
      lineHeight: 4.3,
      padding: 2,
      minHeight: 8,
      fill: [226, 232, 240] as const,
      text: [30, 41, 59] as const,
      border: [148, 163, 184] as const,
    }
  }
  if (style === "table-cell") {
    return {
      fontSize: 8,
      bold: false,
      lineHeight: 4.2,
      padding: 1.8,
      minHeight: 7,
      fill: alternate ? [248, 250, 252] as const : [255, 255, 255] as const,
      text: [51, 65, 85] as const,
      border: [226, 232, 240] as const,
    }
  }
  return {
    fontSize: 8.7,
    bold: false,
    lineHeight: 4.5,
    padding: 2.1,
    minHeight: 7.5,
    fill: [255, 255, 255] as const,
    text: [51, 65, 85] as const,
    border: [226, 232, 240] as const,
  }
}

function drawBilingualColumnHeader(flow: Flow) {
  // User requested to remove blue column headers completely
  return
}

function addBilingualContinuationPage(flow: Flow) {
  addFlowPage(flow)
}

function renderBilingualChecklist(
  flow: Flow,
  engSection: PdfSectionTemplate,
  arSection?: PdfSectionTemplate,
) {
  const engRows = engSection.table?.rows ?? []
  const arRows = arSection?.table?.rows ?? []
  const rowCount = Math.max(engRows.length, arRows.length)

  const gap = 6
  const tableWidth = (flow.width - gap) / 2
  const statusWidth = tableWidth * 0.1
  const itemWidth = tableWidth * 0.68
  const commentWidth = tableWidth - statusWidth - itemWidth
  const englishTableX = flow.x
  const arabicTableX = flow.x + tableWidth + gap

  // English physical order: Status | Inspection Item | Comment
  const englishStatusX = englishTableX
  const englishItemX = englishStatusX + statusWidth
  const englishCommentX = englishItemX + itemWidth
  const englishDividers = [englishItemX, englishCommentX]

  // Arabic physical order: تعليق | بند التفتيش | الحالة
  const arabicCommentX = arabicTableX
  const arabicItemX = arabicCommentX + commentWidth
  const arabicStatusX = arabicItemX + itemWidth
  const arabicDividers = [arabicItemX, arabicStatusX]

  const cellPadding = 1.8
  const badgeW = 3.6
  const badgeH = 3.6
  const textLineHeight = 3.8
  const headerLineHeight = 3.7

  const prepareCell = (text: string, width: number, rtl: boolean, fontSize: number) => {
    if (!normalizeText(text)) return { lines: [] as string[], height: 0 }
    setLanguage(flow.doc, rtl, fontSize, false)
    const lines = textLines(flow.doc, text, width - cellPadding * 2)
    return { lines, height: lines.length * textLineHeight }
  }

  const preparedRows = Array.from({ length: rowCount }, (_, index) => {
    // Both language templates retain [index, item, result, notes]. Pair by
    // checklist index so the saved comment/reference remains with its item.
    const engRow = engRows[index] ?? []
    const arRow = arRows[index] ?? []
    const englishItemText = engRow.length >= 2 ? engRow[1] : (engRow[0] || arRow[1] || arRow[0] || "—")
    const arabicItemText = arRow.length >= 2 ? arRow[1] : (arRow[0] || englishItemText)
    const resultText = engRow.length >= 3 ? engRow[2] : (arRow.length >= 3 ? arRow[2] : "")
    const englishCommentText = engRow.length >= 4 ? engRow[3] : ""
    const arabicCommentText = arRow.length >= 4 ? arRow[3] : ""

    const englishItem = prepareCell(englishItemText, itemWidth, false, 7.8)
    const englishComment = prepareCell(englishCommentText, commentWidth, false, 7.2)
    const arabicItem = prepareCell(arabicItemText, itemWidth, true, 7.8)
    const arabicComment = prepareCell(arabicCommentText, commentWidth, true, 7.2)
    const status = checklistStatusPresentation(resultText, false)
    const height = Math.max(
      7.2,
      Math.max(
        englishItem.height,
        englishComment.height,
        arabicItem.height,
        arabicComment.height,
        badgeH,
      ) + 2.8,
    )

    return {
      englishItem,
      englishComment,
      arabicItem,
      arabicComment,
      status,
      height,
    }
  })

  const headerSpecs = [
    { text: "Status", x: englishStatusX, width: statusWidth, align: "center" as const, rtl: false, fontSize: 6.5, padding: 0.7 },
    { text: "Inspection Item", x: englishItemX, width: itemWidth, align: "left" as const, rtl: false, fontSize: 7.2, padding: cellPadding },
    { text: "Comment", x: englishCommentX, width: commentWidth, align: "left" as const, rtl: false, fontSize: 7.2, padding: cellPadding },
    { text: "تعليق", x: arabicCommentX, width: commentWidth, align: "right" as const, rtl: true, fontSize: 7.2, padding: cellPadding },
    { text: "بند التفتيش", x: arabicItemX, width: itemWidth, align: "right" as const, rtl: true, fontSize: 7.2, padding: cellPadding },
    { text: "الحالة", x: arabicStatusX, width: statusWidth, align: "center" as const, rtl: true, fontSize: 6.3, padding: 0.7 },
  ]
  const preparedHeaders = headerSpecs.map((header) => {
    setLanguage(flow.doc, header.rtl, header.fontSize, false)
    return {
      ...header,
      lines: textLines(flow.doc, header.text, header.width - header.padding * 2),
    }
  })
  const headerHeight = Math.max(
    8.5,
    Math.max(...preparedHeaders.map((header) => header.lines.length), 1) * headerLineHeight + 3,
  )

  // Keep the existing bilingual section titles outside the tables and avoid
  // orphaning them at the bottom of a page when the first paired row follows.
  const firstTableHeight = preparedRows.length ? headerHeight + preparedRows[0].height : 0
  if (preparedRows.length && flow.y + 18 + firstTableHeight > flow.bottom) {
    addBilingualContinuationPage(flow)
  }
  flow.y += 3
  renderBilingualTextRow(flow, engSection.title, arSection?.title || "", { style: "section" })

  if (!preparedRows.length) return

  const drawTableFrame = (
    tableX: number,
    dividerXs: number[],
    y: number,
    height: number,
    fill: [number, number, number],
  ) => {
    flow.doc.setDrawColor(226, 232, 240)
    flow.doc.setFillColor(...fill)
    flow.doc.setLineWidth(0.15)
    flow.doc.rect(tableX, y, tableWidth, height, "FD")
    for (const dividerX of dividerXs) flow.doc.line(dividerX, y, dividerX, y + height)
  }

  const drawHeaders = () => {
    drawTableFrame(englishTableX, englishDividers, flow.y, headerHeight, [248, 250, 252])
    drawTableFrame(arabicTableX, arabicDividers, flow.y, headerHeight, [248, 250, 252])
    flow.doc.setTextColor(15, 23, 42)

    for (const header of preparedHeaders) {
      setLanguage(flow.doc, header.rtl, header.fontSize, false)
      const textHeight = header.lines.length * headerLineHeight
      const startY = flow.y + (headerHeight - textHeight) / 2 + 3
      const textX = header.align === "center"
        ? header.x + header.width / 2
        : header.align === "right"
          ? header.x + header.width - header.padding
          : header.x + header.padding
      writePdfText(
        flow.doc,
        header.lines,
        textX,
        startY,
        { align: header.align, lineHeightFactor: 1.15 },
        header.rtl,
      )
    }

    flow.y += headerHeight
  }

  drawHeaders()

  for (const row of preparedRows) {
    if (flow.y + row.height > flow.bottom) {
      addBilingualContinuationPage(flow)
      drawHeaders()
    }

    const rowY = flow.y
    drawTableFrame(englishTableX, englishDividers, rowY, row.height, [255, 255, 255])
    drawTableFrame(arabicTableX, arabicDividers, rowY, row.height, [255, 255, 255])

    const drawCellText = (input: {
      lines: string[]
      height: number
      x: number
      width: number
      rtl: boolean
      fontSize: number
    }) => {
      if (!input.lines.length) return
      const startY = rowY + (row.height - input.height) / 2 + 2.8
      setLanguage(flow.doc, input.rtl, input.fontSize, false)
      flow.doc.setTextColor(51, 65, 85)
      writePdfText(
        flow.doc,
        input.lines,
        input.rtl ? input.x + input.width - cellPadding : input.x + cellPadding,
        startY,
        { align: input.rtl ? "right" : "left", lineHeightFactor: 1.15 },
        input.rtl,
      )
    }

    drawCellText({ ...row.englishItem, x: englishItemX, width: itemWidth, rtl: false, fontSize: 7.8 })
    drawCellText({ ...row.englishComment, x: englishCommentX, width: commentWidth, rtl: false, fontSize: 7.2 })
    drawCellText({ ...row.arabicItem, x: arabicItemX, width: itemWidth, rtl: true, fontSize: 7.8 })
    drawCellText({ ...row.arabicComment, x: arabicCommentX, width: commentWidth, rtl: true, fontSize: 7.2 })

    const badgeY = rowY + (row.height - badgeH) / 2
    drawChecklistVectorBadge(
      flow.doc,
      englishStatusX + (statusWidth - badgeW) / 2,
      badgeY,
      badgeW,
      badgeH,
      row.status.passed,
      row.status.failed,
      row.status.inProgress,
    )
    drawChecklistVectorBadge(
      flow.doc,
      arabicStatusX + (statusWidth - badgeW) / 2,
      badgeY,
      badgeW,
      badgeH,
      row.status.passed,
      row.status.failed,
      row.status.inProgress,
    )

    flow.y += row.height
  }

  flow.y += 2
}

function renderBilingualTextRow(
  flow: Flow,
  englishText: string | undefined,
  arabicText: string | undefined,
  options: BilingualRowOptions = {},
) {
  const style = options.style ?? "body"
  const { doc } = flow

  // 1. SECTION HEADERS: Clean header with blue accent boxes on outer edges
  if (style === "section") {
    ensureSpace(flow, 16)
    flow.y += 4

    const iconSize = 3.5
    const engStr = (englishText || "").trim()
    const arStr = (arabicText || "").trim()

    // English Header on Left
    if (engStr) {
      doc.setFillColor(180, 138, 32)
      doc.rect(flow.x, flow.y - 2.8, iconSize, iconSize, "F")
      setLanguage(doc, false, 11, true)
      doc.setTextColor(15, 23, 42)
      writePdfText(doc, engStr, flow.x + iconSize + 2.5, flow.y, { align: "left" }, false)
    }

    // Arabic Header on Right
    if (arStr) {
      const arRightX = flow.x + flow.width
      doc.setFillColor(180, 138, 32)
      doc.rect(arRightX - iconSize, flow.y - 2.8, iconSize, iconSize, "F")
      setLanguage(doc, true, 11, true)
      doc.setTextColor(15, 23, 42)
      writePdfText(doc, arStr, arRightX - iconSize - 2.5, flow.y, { align: "right" }, true)
    }

    // Thin light horizontal divider line below section header
    flow.y += 3.5
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.2)
    doc.line(flow.x, flow.y, flow.x + flow.width, flow.y)
    flow.y += 5
    return
  }

  // 2. HEADING (e.g. subheadings inside section)
  if (style === "heading") {
    ensureSpace(flow, 12)
    const gap = 6
    const colW = (flow.width - gap) / 2
    const engLines = bilingualCellLines(doc, englishText, colW, false, 9.5, true)
    const arLines = bilingualCellLines(doc, arabicText, colW, true, 9.5, true)
    const rowH = Math.max(engLines.length, arLines.length, 1) * 4.2

    if (engLines.length) {
      setLanguage(doc, false, 9.5, true)
      doc.setTextColor(30, 41, 59)
      writePdfText(doc, engLines, flow.x, flow.y + 3, { align: "left", lineHeightFactor: 1.15 }, false)
    }
    if (arLines.length) {
      setLanguage(doc, true, 9.5, true)
      doc.setTextColor(30, 41, 59)
      writePdfText(doc, arLines, flow.x + flow.width, flow.y + 3, { align: "right", lineHeightFactor: 1.15 }, true)
    }
    flow.y += rowH + 3
    return
  }

  // 3. TABLE ROWS (Actual tables like approval or structured table cells)
  if (style === "table-header" || style === "table-cell") {
    const appearance = bilingualRowAppearance(style, Boolean(options.alternate))
    const columnWidth = flow.width / 2
    const contentWidth = columnWidth - appearance.padding * 2
    const englishLines = bilingualCellLines(doc, englishText, contentWidth, false, appearance.fontSize, appearance.bold)
    const arabicLines = bilingualCellLines(doc, arabicText, contentWidth, true, appearance.fontSize, appearance.bold)

    const rowH = Math.max(
      appearance.minHeight,
      Math.max(englishLines.length, arabicLines.length, 1) * appearance.lineHeight + appearance.padding * 2,
    )
    if (flow.y + rowH > flow.bottom) addBilingualContinuationPage(flow)

    doc.setFillColor(...appearance.fill)
    doc.rect(flow.x, flow.y, flow.width, rowH, "F")
    doc.setDrawColor(...appearance.border)
    doc.setLineWidth(0.18)
    doc.rect(flow.x, flow.y, flow.width, rowH)
    doc.line(flow.x + columnWidth, flow.y, flow.x + columnWidth, flow.y + rowH)

    if (englishLines.length) {
      setLanguage(doc, false, appearance.fontSize, appearance.bold)
      doc.setTextColor(...appearance.text)
      writePdfText(doc, englishLines, flow.x + appearance.padding, flow.y + appearance.padding + 3, { align: "left", lineHeightFactor: 1.15 }, false)
    }
    if (arabicLines.length) {
      setLanguage(doc, true, appearance.fontSize, appearance.bold)
      doc.setTextColor(...appearance.text)
      writePdfText(doc, arabicLines, flow.x + flow.width - appearance.padding, flow.y + appearance.padding + 3, { align: "right", lineHeightFactor: 1.15 }, true)
    }
    flow.y += rowH
    return
  }

  // 4. BODY PARAGRAPHS (Borderless, clean side-by-side text block matching image 1:1)
  const gap = 8
  const colW = (flow.width - gap) / 2
  const engLines = bilingualCellLines(doc, englishText, colW, false, 8.5, false)
  const arLines = bilingualCellLines(doc, arabicText, colW, true, 8.5, false)

  let engOffset = 0
  let arOffset = 0

  do {
    if (flow.y + 8 > flow.bottom) addBilingualContinuationPage(flow)

    const availH = flow.bottom - flow.y
    const lineH = 3.6
    const maxAvailLines = Math.max(1, Math.floor(availH / lineH))

    const engRem = Math.max(0, engLines.length - engOffset)
    const arRem = Math.max(0, arLines.length - arOffset)
    const segLines = Math.min(Math.max(engRem, arRem, 1), maxAvailLines)

    const engSeg = engLines.slice(engOffset, engOffset + segLines)
    const arSeg = arLines.slice(arOffset, arOffset + segLines)

    const segH = segLines * lineH

    if (engSeg.length) {
      setLanguage(doc, false, 8.5, false)
      doc.setTextColor(51, 65, 85)
      writePdfText(doc, engSeg, flow.x, flow.y + 2.8, { align: "left", lineHeightFactor: 1.05 }, false)
    }

    if (arSeg.length) {
      setLanguage(doc, true, 8.5, false)
      doc.setTextColor(51, 65, 85)
      writePdfText(doc, arSeg, flow.x + flow.width, flow.y + 2.8, { align: "right", lineHeightFactor: 1.05 }, true)
    }

    flow.y += segH
    engOffset += segLines
    arOffset += segLines

    if (engOffset < engLines.length || arOffset < arLines.length) {
      addBilingualContinuationPage(flow)
    }
  } while (engOffset < engLines.length || arOffset < arLines.length)

  // Compact paragraph gap below body text
  flow.y += 2.5
}

async function renderBilingualImageGrid(
  flow: Flow,
  images: PdfImageTemplate[],
  arabicImages: PdfImageTemplate[] = [],
) {
  if (!images.length) return

  const gap = 4
  const colWidth = (flow.width - gap) / 2
  const maxImgH = 68

  for (let i = 0; i < images.length; i += 2) {
    const pair = images.slice(i, i + 2)
    const arPair = arabicImages.slice(i, i + 2)
    const loadedPair = await Promise.all(pair.map((img) => loadImage(img.src)))

    let rowH = 0
    const dimensions = loadedPair.map((img, idx) => {
      if (!img) return { w: colWidth, h: 40 }
      const ratio = Math.min(colWidth / img.width, maxImgH / img.height)
      const w = img.width * ratio
      const h = img.height * ratio
      rowH = Math.max(rowH, h + (pair[idx].caption || arPair[idx]?.caption ? 8 : 0) + 3)
      return { w, h }
    })

    ensureSpace(flow, rowH + 4)

    for (let idx = 0; idx < pair.length; idx += 1) {
      const img = loadedPair[idx]
      const engBlock = pair[idx]
      const arBlock = arPair[idx]
      const dim = dimensions[idx]
      const x = flow.x + idx * (colWidth + gap)

      if (!img) {
        renderBilingualTextRow(flow, engBlock.caption || "Image unavailable.", arBlock?.caption || "", { style: "body" })
        continue
      }

      flow.doc.setDrawColor(226, 232, 240)
      flow.doc.rect(x - 0.5, flow.y - 0.5, dim.w + 1, dim.h + 1)
      flow.doc.addImage(img.dataUrl, "JPEG", x, flow.y, dim.w, dim.h, undefined, "FAST")

      if (engBlock.caption || arBlock?.caption) {
        const engCap = engBlock.caption || ""
        const arCap = arBlock?.caption || ""
        const capLinesEng = textLines(flow.doc, engCap, dim.w)

        setLanguage(flow.doc, false, 7.2, false)
        flow.doc.setTextColor(100, 116, 139)
        writePdfText(flow.doc, capLinesEng, x, flow.y + dim.h + 2.5, { align: "left", lineHeightFactor: 1.1 }, false)

        if (arCap) {
          const capLinesAr = textLines(flow.doc, arCap, dim.w)
          setLanguage(flow.doc, true, 7.2, false)
          flow.doc.setTextColor(100, 116, 139)
          writePdfText(flow.doc, capLinesAr, x + dim.w, flow.y + dim.h + 2.5, { align: "right", lineHeightFactor: 1.1 }, true)
        }
      }
    }
    flow.y += rowH + 4
  }
}

function pairedBlocksByEnglishStructure(englishBlocks: PdfBlock[], arabicBlocks: PdfBlock[]) {
  const queues = new Map<PdfBlock["type"], PdfBlock[]>()
  arabicBlocks.forEach((block) => {
    const queue = queues.get(block.type) ?? []
    queue.push(block)
    queues.set(block.type, queue)
  })
  const indexes = new Map<PdfBlock["type"], number>()

  return englishBlocks.map((english) => {
    const index = indexes.get(english.type) ?? 0
    const arabic = queues.get(english.type)?.[index]
    indexes.set(english.type, index + 1)
    return { english, arabic }
  })
}

function bilingualTableRows(
  english: Extract<PdfBlock, { type: "table" }>,
  arabic?: Extract<PdfBlock, { type: "table" }>,
) {
  const output: Array<{
    english: string
    arabic: string
    header: boolean
    alternate: boolean
    groupEnd: boolean
  }> = []

  english.headers.forEach((header, columnIndex) => {
    output.push({
      english: header || "",
      arabic: arabic?.headers?.[columnIndex] || "",
      header: true,
      alternate: false,
      groupEnd: columnIndex === english.headers.length - 1,
    })
  })

  english.rows.forEach((row, rowIndex) => {
    const columnCount = row.length
    if (!columnCount) {
      output.push({ english: "", arabic: "", header: false, alternate: rowIndex % 2 === 1, groupEnd: true })
      return
    }
    row.forEach((cell, columnIndex) => {
      output.push({
        english: cell || "",
        arabic: arabic?.rows?.[rowIndex]?.[columnIndex] || "",
        header: false,
        alternate: rowIndex % 2 === 1,
        groupEnd: columnIndex === columnCount - 1,
      })
    })
  })
  return output
}

async function renderBilingualImagePair(
  flow: Flow,
  english: Extract<PdfBlock, { type: "image" }>,
  arabic?: Extract<PdfBlock, { type: "image" }>,
) {
  const image = await loadImage(english.src)
  if (!image) {
    renderBilingualTextRow(flow, english.caption || "Image unavailable.", arabic?.caption || "", { style: "body" })
    return
  }

  const maxWidth = Math.min(flow.width, flow.width * Math.max(0.35, Math.min(1, english.preferredWidthRatio ?? 1)))
  const maxHeight = 105
  const ratio = Math.min(maxWidth / image.width, maxHeight / image.height)
  const width = image.width * ratio
  const height = image.height * ratio
  if (flow.y + height + 4 > flow.bottom) addBilingualContinuationPage(flow)
  const x = flow.x + (flow.width - width) / 2
  flow.doc.setDrawColor(203, 213, 225)
  flow.doc.rect(x - 0.5, flow.y - 0.5, width + 1, height + 1)
  flow.doc.addImage(image.dataUrl, "JPEG", x, flow.y, width, height, undefined, "FAST")
  flow.y += height + 2
  if (english.caption || arabic?.caption) {
    renderBilingualTextRow(flow, english.caption, arabic?.caption, { style: "body" })
  }
  flow.y += 2
}

async function renderBilingualBlockPair(
  flow: Flow,
  english: PdfBlock,
  arabic: PdfBlock | undefined,
) {
  if (english.type === "heading") {
    renderBilingualTextRow(
      flow,
      english.text,
      arabic?.type === "heading" ? arabic.text : "",
      { style: "heading" },
    )
    return
  }
  if (english.type === "paragraph") {
    const englishBullet = (english as any).bullet ? `${(english as any).bullet} ` : ""
    const arabicBullet = arabic?.type === "paragraph" && (arabic as any).bullet ? `${(arabic as any).bullet} ` : englishBullet
    renderBilingualTextRow(
      flow,
      `${englishBullet}${english.text}`,
      arabic?.type === "paragraph" ? `${arabicBullet}${arabic.text}` : "",
      { style: "body" },
    )
    return
  }
  if (english.type === "list") {
    const arabicItems = arabic?.type === "list" ? arabic.items : []
    english.items.forEach((item, index) => {
      const prefix = english.ordered ? `${index + 1}. ` : "• "
      renderBilingualTextRow(flow, `${prefix}${item}`, arabicItems[index] ? `${prefix}${arabicItems[index]}` : "", { style: "body" })
    })
    return
  }
  if (english.type === "table") {
    const arabicTable = arabic?.type === "table" ? arabic : undefined
    bilingualTableRows(english, arabicTable).forEach((row) => {
      renderBilingualTextRow(flow, row.english, row.arabic, {
        style: row.header ? "table-header" : "table-cell",
        alternate: row.alternate,
        groupEnd: row.groupEnd,
      })
    })
    return
  }
  if (english.type === "image") {
    await renderBilingualImagePair(flow, english, arabic?.type === "image" ? arabic : undefined)
    return
  }
  if (english.type === "spacer") {
    const height = Math.max(english.height, arabic?.type === "spacer" ? arabic.height : 0)
    if (flow.y + height > flow.bottom) addBilingualContinuationPage(flow)
    flow.y += height
  }
}

function sectionContentBlocks(section: PdfSectionTemplate) {
  const blocks = section.html !== undefined ? htmlToBlocks(section.html) : []
  if (section.table && Array.isArray(section.table.rows) && section.table.rows.length > 0) {
    blocks.push({ type: "table", ...section.table })
  }
  const flowImages = (section.images ?? []).filter((image) => image.flowTarget === "section")
  return flattenPdfBlocks(interleaveFlowImages(blocks, flowImages))
}

function sectionDocumentBlocks(section: PdfSectionTemplate) {
  if (!section.documentsTitle) return [] as PdfBlock[]
  const sourceBlocks = htmlToBlocks(section.sourceDocumentHtml ?? section.documentsHtml ?? "")
  const sourceImages = (section.images ?? []).filter((image) => image.flowTarget === "documents")
  const reconstructed = interleaveFlowImages(sourceBlocks, sourceImages)
  const other = htmlToBlocks(section.otherDocumentsHtml ?? "")
  return flattenPdfBlocks([...reconstructed, ...other])
}

async function buildNativeBilingualPdfBlob(input: {
  data: StageTranslationPageData
  translation: StageTranslationRecord
  englishTemplate: LanguagePdfTemplate
  arabicTemplate: LanguagePdfTemplate
  sourceDocument?: ExtractedSourceDocument | null
  appendClosingBlock?: boolean
}) {
  const { data, englishTemplate, arabicTemplate, appendClosingBlock = false } = input
  const profile = await fetchOrganizationProfileFromDb()
  const pdfHeaderLogoSource = profile.pdfHeaderLogoUrl || "/LogoB.png"
  const closingLogoSource = profile.pdfLogoUrl || CLOSING_LOGO_URL
  const [JsPdf, logoImage, closingLogoImage] = await Promise.all([
    loadPdfTools(),
    loadImage(pdfHeaderLogoSource),
    appendClosingBlock ? loadImage(closingLogoSource) : Promise.resolve(null),
  ])
  const doc = new JsPdf({
    unit: "mm",
    format: "a4",
    orientation: "portrait",
    compress: true,
    putOnlyUsedFonts: true,
  })
  await installFonts(doc)

  const flow: Flow = {
    doc,
    template: englishTemplate,
    rtl: false,
    pageWidth: PAGE.portraitWidth,
    pageHeight: PAGE.portraitHeight,
    x: PAGE.margin,
    y: 0,
    width: PAGE.portraitWidth - PAGE.margin * 2,  // 182 mm
    bottom: PAGE.portraitHeight - PAGE.footer - 5,
    pageNumber: 1,
    logoImage,
    closingLogoImage,
  }

  drawFirstPageHeader(flow, { bilingualSupervisorLabel: true, bilingualProjectLocationCell: true })

  const engSections = englishTemplate.sections
  const arSections = arabicTemplate.sections
  const arSectionMap = new Map(arSections.map((s) => [s.key, s]))

  for (const engSection of engSections) {
    const engTitleLower = engSection.title.toLowerCase()
    if (
      engSection.key === "projectInformation" ||
      engSection.key === "project-info" ||
      engSection.key === "reportDetails" ||
      engSection.key === "report-details" ||
      engTitleLower.includes("project information") ||
      engTitleLower.includes("report details")
    ) {
      continue // Skip redundant top project info & report details table
    }

    const arSection = arSectionMap.get(engSection.key)

    if (
      engSection.key === "checklist" ||
      engTitleLower.includes("checklist") ||
      engTitleLower.includes("فحص")
    ) {
      renderBilingualChecklist(flow, engSection, arSection)
      flow.y += 4
      continue
    }

    const engBlocks = sectionContentBlocks(engSection)
    const arBlocks = arSection ? sectionContentBlocks(arSection) : []
    const engDocumentBlocks = sectionDocumentBlocks(engSection)
    const arDocumentBlocks = arSection ? sectionDocumentBlocks(arSection) : []
    const galleryImages = (engSection.images ?? []).filter((image) => image.flowTarget !== "section" && image.flowTarget !== "documents")
    const arabicGalleryImages = (arSection?.images ?? []).filter((image) => image.flowTarget !== "section" && image.flowTarget !== "documents")
    const hasContent = engBlocks.length > 0 || engDocumentBlocks.length > 0 || galleryImages.length > 0

    if (!hasContent) continue

    if (flow.y + 11 > flow.bottom) addBilingualContinuationPage(flow)
    flow.y += 3
    renderBilingualTextRow(flow, engSection.title, arSection?.title || "", { style: "section" })

    for (const pair of pairedBlocksByEnglishStructure(engBlocks, arBlocks)) {
      await renderBilingualBlockPair(flow, pair.english, pair.arabic)
    }

    if (engDocumentBlocks.length) {
      renderBilingualTextRow(flow, engSection.documentsTitle || "Related Documents", arSection?.documentsTitle || "", { style: "heading" })
      for (const pair of pairedBlocksByEnglishStructure(engDocumentBlocks, arDocumentBlocks)) {
        await renderBilingualBlockPair(flow, pair.english, pair.arabic)
      }
    }

    if (galleryImages.length) {
      renderBilingualTextRow(flow, engSection.imageTitle || "Images", arSection?.imageTitle || "", { style: "heading" })
      await renderBilingualImageGrid(flow, galleryImages, arabicGalleryImages)
    }

    flow.y += 4
  }

  if (appendClosingBlock) {
    renderBilingualTranslationClosingBlock(flow)
  }

  addPageNumbers(doc, false)
  doc.setProperties({
    title: `${data.response.reportTitle} — Simultaneous Bilingual`,
    subject: data.response.subject || data.term.name,
    author: data.project.name,
    creator: "BuildSight AI Document Translation",
  })
  return doc.output("blob") as Blob
}


function normalizeStaticFooterText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .toLocaleLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/www\./g, "")
    .replace(/[^\p{L}\p{N}@.+-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function footerDigits(value: string) {
  return normalizeStaticFooterText(value).replace(/\D/g, "")
}

function hasStrongFooterWordOverlap(text: string, candidate: string) {
  const textWords = new Set(normalizeStaticFooterText(text).split(" ").filter((word) => word.length >= 3))
  const candidateWords = normalizeStaticFooterText(candidate).split(" ").filter((word) => word.length >= 3)
  if (candidateWords.length < 2) return false
  const matches = candidateWords.filter((word) => textWords.has(word)).length
  return matches >= Math.max(2, Math.ceil(candidateWords.length * 0.65))
}

function sourceStaticFooterTexts(sourceDocument: ExtractedSourceDocument | null) {
  if (!sourceDocument) return new Set<string>()
  const footerBlocks = sourceDocument.pages.flatMap((page) =>
    (page.layoutBlocks ?? [])
      .filter((block) => block.yRatio >= 0.82 || block.yRatio + block.heightRatio >= 0.9)
      .map((block) => normalizeStaticFooterText(block.text))
      .filter(Boolean),
  )
  const frequencies = new Map<string, number>()
  footerBlocks.forEach((text) => {
    const stable = text.replace(/\d+/g, "#")
    frequencies.set(stable, (frequencies.get(stable) ?? 0) + 1)
  })
  return new Set(footerBlocks.filter((text) => {
    const stable = text.replace(/\d+/g, "#")
    return (frequencies.get(stable) ?? 0) >= 2
      || /(?:@|\b(?:tel|phone|email|website|www|c\.?\s*r\.?|p\.?\s*o\.?\s*box|postal\s*code|page)\b|هاتف|البريد|الموقع|السجل\s*التجاري|صندوق\s*البريد|الرمز\s*البريدي|الصفحة)/i.test(text)
  }))
}

function isStaticOrganizationFooterText(text: string, sourceFooterTexts: Set<string>) {
  const normalized = normalizeStaticFooterText(text)
  if (!normalized || normalized.length > 500) return false

  const profile = getOrganizationProfile()
  const exactProfileValues = [
    profile.nameEn,
    profile.nameAr,
    profile.addressEn,
    profile.addressAr,
    profile.email,
    profile.website,
  ]
    .map(normalizeStaticFooterText)
    .filter((value) => value.length >= 4)

  if (exactProfileValues.some((value) => normalized === value || normalized.includes(value))) return true
  if (normalized.length <= 240 && [profile.nameEn, profile.nameAr, profile.addressEn, profile.addressAr]
    .some((value) => hasStrongFooterWordOverlap(normalized, value))) return true
  if (sourceFooterTexts.has(normalized)) return true

  const email = normalizeStaticFooterText(profile.email)
  if (email && normalized.includes(email)) return true

  const website = normalizeStaticFooterText(profile.website).replace(/^@/, "")
  if (website && website.length >= 4 && normalized.replace(/^@/, "").includes(website)) return true

  const textDigits = footerDigits(text)
  const phoneMatches = profile.phones
    .split(/[,;/|]+/)
    .map(footerDigits)
    .filter((value) => value.length >= 7)
  if (phoneMatches.some((digits) => textDigits.includes(digits))) return true

  const registrationDigits = footerDigits(profile.crNumber)
  const hasRegistrationValue = registrationDigits.length >= 3 && textDigits.includes(registrationDigits)
  const hasRegistrationLabel = /(?:\bc\.?\s*r\.?\b|commercial\s*registration|registration\s*(?:no|number)|السجل\s*التجاري|رقم\s*السجل)/i.test(normalized)
  if (hasRegistrationValue && hasRegistrationLabel) return true

  const poBoxDigits = footerDigits(profile.poBox)
  const postalCodeDigits = footerDigits(profile.postalCode)
  const hasPoBox = poBoxDigits.length >= 2 && textDigits.includes(poBoxDigits)
  const hasPostalCode = postalCodeDigits.length >= 2 && textDigits.includes(postalCodeDigits)
  const hasPostalLabel = /(?:p\.?\s*o\.?\s*box|postal\s*code|صندوق\s*البريد|ص\.?\s*ب|الرمز\s*البريدي)/i.test(normalized)
  if (hasPostalLabel && (hasPoBox || hasPostalCode)) return true

  const looksLikeFixedContactLine = /(?:\b(?:tel|phone|email|website|www)\b|هاتف|البريد\s*الإلكتروني|الموقع\s*الإلكتروني)/i.test(normalized)
    && (/@/.test(normalized) || textDigits.length >= 7)
  if (looksLikeFixedContactLine) return true

  return /^(?:page|الصفحة)\s*[:#-]?\s*\d+(?:\s*(?:\/|of|من)\s*\d+)?$/i.test(normalized)
}

function stripStaticFooterFromDocumentHtml(html: string | undefined, sourceFooterTexts: Set<string>) {
  if (!html?.trim()) return html ?? ""
  const root = parsePdfHtmlRoot(html)
  if (!root) return html

  const selector = "p,h1,h2,h3,h4,h5,h6,li,address,tr,div"
  const candidates = Array.from(root.querySelectorAll(selector)).filter((element) => {
    if (element.tagName.toLowerCase() !== "div") return true
    return !element.querySelector(selector)
  })

  candidates.forEach((element) => {
    const text = normalizeText(element.textContent || "")
    if (!isStaticOrganizationFooterText(text, sourceFooterTexts)) return

    if (element.tagName.toLowerCase() === "tr") {
      // Preserve the canonical table row/cell structure while removing only
      // static footer text from the mirrored document body.
      directTableCells(element).forEach((cell) => {
        textNodesOutsideNestedTables(cell).forEach((node) => {
          node.nodeValue = ""
        })
      })
      return
    }
    element.remove()
  })

  Array.from(root.querySelectorAll("p,h1,h2,h3,h4,h5,h6,li,address,div"))
    .reverse()
    .forEach((element) => {
      if (element.textContent?.trim()) return
      if (element.querySelector("img,table,svg,canvas")) return
      element.remove()
    })

  return root.innerHTML
}

function stripStaticFooterFromDocumentTemplate(
  template: LanguagePdfTemplate,
  sourceDocument: ExtractedSourceDocument | null,
) {
  const sourceFooterTexts = sourceStaticFooterTexts(sourceDocument)
  return {
    ...template,
    sections: template.sections.map((section) => {
      if (section.key !== "attachments") return section
      const sourceDocumentHtml = stripStaticFooterFromDocumentHtml(section.sourceDocumentHtml, sourceFooterTexts)
      const otherDocumentsHtml = stripStaticFooterFromDocumentHtml(section.otherDocumentsHtml, sourceFooterTexts)
      return {
        ...section,
        sourceDocumentHtml,
        otherDocumentsHtml,
        documentsHtml: `${sourceDocumentHtml}${otherDocumentsHtml}`,
      }
    }),
  }
}

function formatCcRecipientForPdf(recipient: ReportCcRecipient) {
  const normalizedName = recipient.name.trim() || "—"
  const seen = new Set([normalizedName.toLocaleLowerCase()])
  const details = [recipient.role, recipient.company, recipient.phone, recipient.type === "external" ? recipient.email : null]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value) => {
      const key = value.toLocaleLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  return [normalizedName, ...details].join("\n")
}

export async function exportTranslationPdf({
  data,
  translation,
  kind,
  ccRecipients = [],
  appendClosingBlock = true,
}: {
  data: StageTranslationPageData
  translation: StageTranslationRecord | null
  kind: PdfKind
  ccRecipients?: ReportCcRecipient[]
  appendClosingBlock?: boolean
}) {
  const projectName = data.project.name
  const submissionDate = data.response.createdAt || data.response.updatedAt
  const sourcePdf = getSourcePdfAttachment(data)
  const ccMetadata = ccRecipients.map(formatCcRecipientForPdf)
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

  const rawEnglishTemplate = buildLanguagePdfTemplate({ data, translation, language: "en", sourceDocument, ccRecipientsList: ccRecipients, ccRecipients: ccMetadata })
  // Static company/footer lines are already drawn by the fixed PDF footer.
  // Remove them from attachment body content in both languages before the
  // English structure becomes the canonical mirrored document schema.
  const englishTemplate = stripStaticFooterFromDocumentTemplate(rawEnglishTemplate, sourceDocument)

  if (kind === "original") {
    validateTemplateAssets(englishTemplate, sourceDocument)
    return {
      blob: await buildLanguagePdfBlob(englishTemplate, { appendClosingBlock }),
      filename: formatReportPdfFilename(projectName, submissionDate, "English"),
    }
  }

  const rawArabicTemplate = buildLanguagePdfTemplate({ data, translation, language: "ar", sourceDocument, ccRecipientsList: ccRecipients, ccRecipients: ccMetadata })
  const footerCleanArabicTemplate = stripStaticFooterFromDocumentTemplate(rawArabicTemplate, sourceDocument)
  const arabicTemplate = synchronizeMirroredDocumentStructures(englishTemplate, footerCleanArabicTemplate)

  if (kind === "arabic" || kind === "bilingual") {
    if (!translation?.translatedContent) throw new Error("Bilingual translation content is not ready for Bilingual PDF generation.")
  }

  if (kind === "arabic") {
    validateTemplateAssets(arabicTemplate, sourceDocument)
    const arabicBlob = await buildLanguagePdfBlob(arabicTemplate, { appendClosingBlock })
    return {
      blob: arabicBlob,
      filename: formatReportPdfFilename(projectName, submissionDate, "Arabic"),
    }
  }

  const bilingualBlob = await buildNativeBilingualPdfBlob({
    data,
    translation: translation!,
    englishTemplate,
    arabicTemplate,
    sourceDocument,
    appendClosingBlock,
  })
  return {
    blob: bilingualBlob,
    filename: formatReportPdfFilename(projectName, submissionDate, "Bilingual"),
  }
}
