"use client"

import type { ProjectStageAttachment } from "@/lib/db/project-stages"
import type { ExtractedPdfPage, ExtractedSourceDocument } from "@/lib/stage-translations/pdf-templates"
import type { StageTranslationPageData } from "@/lib/stage-translations/types"
import { stageSourceDocumentUrl } from "@/lib/stage-translations/source-document"

const PDFJS_SCRIPT_ID = "buildsight-pdfjs"
const PDFJS_SCRIPT_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"

type PdfJsLibrary = {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument: (source: string | { url: string }) => { promise: Promise<any>; destroy?: () => void }
  renderTextLayer?: (options: Record<string, unknown>) => { promise?: Promise<void> } | Promise<void>
}

type PdfJsWindow = Window & { pdfjsLib?: PdfJsLibrary }

let pdfJsPromise: Promise<PdfJsLibrary> | null = null

export function loadPdfJs() {
  if (typeof window === "undefined") return Promise.reject(new Error("PDF viewing is available only in the browser."))
  const pdfWindow = window as PdfJsWindow
  if (pdfWindow.pdfjsLib) {
    pdfWindow.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL
    return Promise.resolve(pdfWindow.pdfjsLib)
  }
  if (pdfJsPromise) return pdfJsPromise

  pdfJsPromise = new Promise<PdfJsLibrary>((resolve, reject) => {
    const existing = document.getElementById(PDFJS_SCRIPT_ID) as HTMLScriptElement | null
    const script = existing ?? document.createElement("script")
    const timeout = window.setTimeout(() => {
      pdfJsPromise = null
      reject(new Error("PDF viewer tools did not load. Check the network connection and try again."))
    }, 20_000)

    const finish = () => {
      window.clearTimeout(timeout)
      const library = (window as PdfJsWindow).pdfjsLib
      if (!library) {
        pdfJsPromise = null
        reject(new Error("PDF viewer tools failed to initialize."))
        return
      }
      library.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL
      resolve(library)
    }
    const fail = () => {
      window.clearTimeout(timeout)
      pdfJsPromise = null
      script.remove()
      reject(new Error("PDF viewer tools could not be loaded."))
    }

    script.addEventListener("load", finish, { once: true })
    script.addEventListener("error", fail, { once: true })
    if (!existing) {
      script.id = PDFJS_SCRIPT_ID
      script.src = PDFJS_SCRIPT_URL
      script.async = true
      script.crossOrigin = "anonymous"
      script.referrerPolicy = "no-referrer"
      document.head.appendChild(script)
    }
  })

  return pdfJsPromise
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

type TextItem = {
  str: string
  transform?: number[]
  width?: number
  height?: number
  hasEOL?: boolean
}

type TextLine = {
  y: number
  fontSize: number
  items: Array<{ text: string; x: number; width: number; fontSize: number }>
}

function groupTextLines(items: TextItem[]) {
  const lines: TextLine[] = []
  for (const item of items) {
    const text = item.str?.replace(/\s+/g, " ").trim()
    if (!text) continue
    const transform = item.transform ?? [1, 0, 0, 1, 0, 0]
    const x = Number(transform[4] ?? 0)
    const y = Number(transform[5] ?? 0)
    const fontSize = Math.max(6, Math.abs(Number(transform[3] ?? item.height ?? 10)))
    const width = Math.max(0, Number(item.width ?? text.length * fontSize * 0.45))
    let line = lines.find((candidate) => Math.abs(candidate.y - y) <= Math.max(2, fontSize * 0.28))
    if (!line) {
      line = { y, fontSize, items: [] }
      lines.push(line)
    }
    line.fontSize = Math.max(line.fontSize, fontSize)
    line.items.push({ text, x, width, fontSize })
  }
  for (const line of lines) line.items.sort((left, right) => left.x - right.x)
  return lines.sort((left, right) => right.y - left.y)
}

function median(values: number[]) {
  if (!values.length) return 10
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function lineCells(line: TextLine) {
  const cells: string[] = []
  let current = ""
  let previousEnd: number | null = null
  for (const item of line.items) {
    const gap = previousEnd === null ? 0 : item.x - previousEnd
    const splitThreshold = Math.max(28, item.fontSize * 2.4)
    if (previousEnd !== null && gap > splitThreshold && current.trim()) {
      cells.push(current.trim())
      current = ""
    }
    current += `${current ? " " : ""}${item.text}`
    previousEnd = item.x + item.width
  }
  if (current.trim()) cells.push(current.trim())
  return cells
}

export function textContentToHtml(textContent: { items?: TextItem[] }) {
  const lines = groupTextLines(textContent.items ?? [])
  if (!lines.length) return ""
  const baseSize = median(lines.map((line) => line.fontSize))
  const output: string[] = []

  for (let index = 0; index < lines.length;) {
    const cells = lineCells(lines[index])
    if (cells.length >= 2) {
      const tableRows: string[][] = [cells]
      let cursor = index + 1
      while (cursor < lines.length) {
        const nextCells = lineCells(lines[cursor])
        if (nextCells.length !== cells.length || nextCells.length < 2) break
        tableRows.push(nextCells)
        cursor += 1
      }
      if (tableRows.length >= 2) {
        output.push(`<table><tbody>${tableRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`)
        index = cursor
        continue
      }
    }

    const text = lines[index].items.map((item) => item.text).join(" ").replace(/\s+/g, " ").trim()
    if (text) {
      const ratio = lines[index].fontSize / Math.max(1, baseSize)
      const tag = ratio >= 1.6 ? "h2" : ratio >= 1.25 ? "h3" : "p"
      output.push(`<${tag}>${escapeHtml(text)}</${tag}>`)
    }
    index += 1
  }
  return output.join("")
}

async function renderPagePreview(page: any, targetWidth: number) {
  const initialViewport = page.getViewport({ scale: 1 })
  const scale = Math.max(0.35, targetWidth / Math.max(1, initialViewport.width))
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d", { alpha: false })
  if (!context) return null
  canvas.width = Math.max(1, Math.ceil(viewport.width))
  canvas.height = Math.max(1, Math.ceil(viewport.height))
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: context, viewport, background: "#ffffff" }).promise
  return canvas.toDataURL("image/jpeg", 0.82)
}

export async function loadSourcePdfDocument(
  data: StageTranslationPageData,
  attachment: ProjectStageAttachment,
) {
  const pdfjs = await loadPdfJs()
  const url = stageSourceDocumentUrl(data, attachment)
  const loadingTask = pdfjs.getDocument({ url })
  const documentProxy = await loadingTask.promise
  return { pdfjs, documentProxy, loadingTask, url }
}

export async function extractSourcePdf(
  data: StageTranslationPageData,
  attachment: ProjectStageAttachment,
  options: { includePageImages?: boolean; imageWidth?: number } = {},
): Promise<ExtractedSourceDocument> {
  const { documentProxy, loadingTask } = await loadSourcePdfDocument(data, attachment)
  const pages: ExtractedPdfPage[] = []
  try {
    for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
      const page = await documentProxy.getPage(pageNumber)
      const textContent = await page.getTextContent({ includeMarkedContent: true })
      const textHtml = textContentToHtml(textContent)
      const textLength = (textContent.items ?? []).reduce((sum: number, item: TextItem) => sum + (item.str?.trim().length ?? 0), 0)
      const shouldRenderImage = options.includePageImages === true && textLength < 120
      const imageDataUrl = shouldRenderImage
        ? await renderPagePreview(page, options.imageWidth ?? 520)
        : null
      pages.push({ pageNumber, textHtml, imageDataUrl })
      page.cleanup?.()
    }
  } finally {
    await documentProxy.destroy?.()
    loadingTask.destroy?.()
  }
  return {
    filename: attachment.originalFilename,
    pageCount: pages.length,
    pages,
  }
}
