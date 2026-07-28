"use client"

import type { ProjectStageAttachment } from "@/lib/db/project-stages"
import type {
  ExtractedPdfImage,
  ExtractedPdfPage,
  ExtractedSourceDocument,
  SourceImageSectionHint,
} from "@/lib/stage-translations/pdf-templates"
import type { StageTranslationPageData } from "@/lib/stage-translations/types"
import { stageSourceDocumentUrl } from "@/lib/stage-translations/source-document"

const PDFJS_SCRIPT_ID = "buildsight-pdfjs"
const PDFJS_SCRIPT_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
const IMAGE_OBJECT_TIMEOUT_MS = 5_000
const MIN_EXTRACTED_IMAGE_PIXELS = 8

type PdfJsLibrary = {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument: (source: string | { url?: string; data?: Uint8Array | ArrayBuffer }) => { promise: Promise<any>; destroy?: () => void }
  OPS?: Record<string, number>
  ImageKind?: Record<string, number>
  renderTextLayer?: (options: Record<string, unknown>) => { promise?: Promise<void> } | Promise<void>
}

type PdfJsWindow = Window & { pdfjsLib?: PdfJsLibrary }
type Matrix = [number, number, number, number, number, number]

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

type PositionedTextLine = TextLine & {
  text: string
  minX: number
  maxX: number
  viewportY: number
}

type ImageBox = {
  xRatio: number
  yRatio: number
  widthRatio: number
  heightRatio: number
  pixelWidth: number
  pixelHeight: number
}

type ImagePlacement = {
  objectKey: string
  imageObject: unknown
  box: ImageBox
  operationIndex: number
}

type RenderedPagePreview = {
  dataUrl: string
  width: number
  height: number
}

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

function multiplyMatrices(left: Matrix, right: Matrix): Matrix {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ]
}

function transformPoint(matrix: Matrix, x: number, y: number) {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  }
}

function placementBox(matrix: Matrix, viewport: any): ImageBox | null {
  const points = [
    transformPoint(matrix, 0, 0),
    transformPoint(matrix, 1, 0),
    transformPoint(matrix, 0, 1),
    transformPoint(matrix, 1, 1),
  ].map((point) => {
    const converted = viewport.convertToViewportPoint?.(point.x, point.y)
    return converted ? { x: Number(converted[0]), y: Number(converted[1]) } : point
  })
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)
  if (width < MIN_EXTRACTED_IMAGE_PIXELS || height < MIN_EXTRACTED_IMAGE_PIXELS) return null
  return {
    xRatio: Math.max(0, Math.min(1, minX / Math.max(1, viewport.width))),
    yRatio: Math.max(0, Math.min(1, minY / Math.max(1, viewport.height))),
    widthRatio: Math.max(0.01, Math.min(1, width / Math.max(1, viewport.width))),
    heightRatio: Math.max(0.01, Math.min(1, height / Math.max(1, viewport.height))),
    pixelWidth: width,
    pixelHeight: height,
  }
}

function positionedTextLines(lines: TextLine[], viewport: any): PositionedTextLine[] {
  return lines.map((line) => {
    const minPdfX = Math.min(...line.items.map((item) => item.x))
    const maxPdfX = Math.max(...line.items.map((item) => item.x + item.width))
    const first = viewport.convertToViewportPoint?.(minPdfX, line.y) ?? [minPdfX, line.y]
    const last = viewport.convertToViewportPoint?.(maxPdfX, line.y) ?? [maxPdfX, line.y]
    return {
      ...line,
      text: line.items.map((item) => item.text).join(" ").replace(/\s+/g, " ").trim(),
      minX: Math.min(Number(first[0]), Number(last[0])),
      maxX: Math.max(Number(first[0]), Number(last[0])),
      viewportY: (Number(first[1]) + Number(last[1])) / 2,
    }
  })
}

const CAPTION_PATTERN = /^(?:(?:figure|fig\.?|photo|image|plate|photograph)\s*(?:(?:no\.?|number)\s*)?|(?:شكل|الشكل|صورة|الصورة)\s*(?:رقم\s*)?)[\d٠-٩]*/i

function horizontalOverlap(line: PositionedTextLine, box: ImageBox, viewport: any) {
  const boxLeft = box.xRatio * viewport.width
  const boxRight = boxLeft + box.widthRatio * viewport.width
  return Math.max(0, Math.min(line.maxX, boxRight) - Math.max(line.minX, boxLeft)) / Math.max(1, Math.min(line.maxX - line.minX, boxRight - boxLeft))
}

function findImageCaption(lines: PositionedTextLine[], box: ImageBox, viewport: any) {
  const imageTop = box.yRatio * viewport.height
  const imageBottom = imageTop + box.heightRatio * viewport.height
  let best: { text: string; score: number } | null = null
  for (const line of lines) {
    if (!line.text || line.text.length > 280) continue
    const belowDistance = line.viewportY - imageBottom
    const aboveDistance = imageTop - line.viewportY
    const isBelow = belowDistance >= -3 && belowDistance <= 95
    const isAbove = aboveDistance >= 0 && aboveDistance <= 42
    if (!isBelow && !isAbove) continue
    const overlap = horizontalOverlap(line, box, viewport)
    const captionLike = CAPTION_PATTERN.test(line.text)
    if (!captionLike && overlap < 0.2) continue
    const distance = isBelow ? Math.max(0, belowDistance) : aboveDistance + 25
    const score = (captionLike ? 90 : 0) + overlap * 35 - distance * 0.35
    if (!best || score > best.score) best = { text: line.text, score }
  }
  return best?.text ?? ""
}

const SECTION_PATTERNS: Array<{ key: SourceImageSectionHint; pattern: RegExp }> = [
  { key: "correctiveActions", pattern: /corrective\s+actions?|remedial\s+actions?|الإجراءات\s+التصحيحية/i },
  { key: "recommendations", pattern: /recommendations?|التوصيات/i },
  { key: "findings", pattern: /findings?|inspection\s+results?|النتائج/i },
  { key: "observation", pattern: /observations?|inspection\s+observations?|site\s+observations?|المعاينة|الملاحظات/i },
  { key: "feedback", pattern: /feedback|general\s+comments?|general\s+remarks?|الملاحظات\s+العامة/i },
  { key: "checklist", pattern: /inspection\s+checklist|checklist|قائمة\s+فحص/i },
  { key: "approvals", pattern: /approval\s+information|approvals?|reviewer|معلومات\s+الاعتماد|الاعتماد/i },
  { key: "evidence", pattern: /attachments?|image\s+evidence|photographs?|site\s+photos?|المرفقات|صور\s+الإثبات/i },
  { key: "documents", pattern: /related\s+documents?|documents?|المستندات\s+المرتبطة/i },
]

function classifySection(text: string): SourceImageSectionHint | null {
  for (const definition of SECTION_PATTERNS) {
    if (definition.pattern.test(text)) return definition.key
  }
  return null
}

function inferImageSection(lines: PositionedTextLine[], box: ImageBox, viewport: any, pageText: string) {
  const imageTop = box.yRatio * viewport.height
  const baseFont = median(lines.map((line) => line.fontSize))
  const above = lines
    .filter((line) => line.viewportY <= imageTop + 4 && imageTop - line.viewportY <= viewport.height * 0.5)
    .sort((left, right) => right.viewportY - left.viewportY)
  for (const line of above) {
    const key = classifySection(line.text)
    if (key && (line.fontSize >= baseFont * 1.05 || imageTop - line.viewportY <= 110)) return key
  }
  return classifySection(pageText)
}

function getObjectFromStore(store: any, key: string) {
  return new Promise<unknown | null>((resolve) => {
    if (!store || !key) {
      resolve(null)
      return
    }
    let settled = false
    let timeout = 0
    const finish = (value: unknown) => {
      if (settled) return
      settled = true
      if (timeout) window.clearTimeout(timeout)
      resolve(value ?? null)
    }
    timeout = window.setTimeout(() => finish(null), IMAGE_OBJECT_TIMEOUT_MS)
    try {
      const immediate = store.get(key, finish)
      if (immediate !== undefined && immediate !== null) finish(immediate)
    } catch {
      finish(null)
    }
  })
}

async function resolvePdfImageObject(page: any, value: unknown) {
  if (value && typeof value === "object") return value
  const key = String(value ?? "")
  if (!key) return null
  return await getObjectFromStore(page.objs, key) ?? await getObjectFromStore(page.commonObjs, key)
}

function collectImagePlacements(pdfjs: PdfJsLibrary, page: any, operatorList: any, viewport: any) {
  const operations = pdfjs.OPS ?? {}
  const save = operations.save
  const restore = operations.restore
  const transform = operations.transform
  const imageOperations = new Set([
    operations.paintImageXObject,
    operations.paintInlineImageXObject,
    operations.paintImageXObjectRepeat,
    operations.paintInlineImageXObjectGroup,
    operations.paintImageMaskXObject,
    operations.paintImageMaskXObjectRepeat,
    operations.paintSolidColorImageMask,
  ].filter((value): value is number => typeof value === "number"))
  const placements: Array<{ objectKey: string; imageReference: unknown; box: ImageBox; operationIndex: number }> = []
  const stack: Matrix[] = []
  let current: Matrix = [1, 0, 0, 1, 0, 0]
  let hasImageOperations = false

  for (let index = 0; index < (operatorList.fnArray?.length ?? 0); index += 1) {
    const operation = operatorList.fnArray[index]
    const args = operatorList.argsArray?.[index] ?? []
    if (operation === save) {
      stack.push([...current] as Matrix)
      continue
    }
    if (operation === restore) {
      current = stack.pop() ?? [1, 0, 0, 1, 0, 0]
      continue
    }
    if (operation === transform && args.length >= 6) {
      const next: Matrix = [Number(args[0]), Number(args[1]), Number(args[2]), Number(args[3]), Number(args[4]), Number(args[5])]
      current = multiplyMatrices(current, next)
      continue
    }
    if (!imageOperations.has(operation)) continue
    hasImageOperations = true

    if (operation === operations.paintImageXObjectRepeat || operation === operations.paintImageMaskXObjectRepeat) {
      const reference = args[0]
      const scaleX = Number(args[1] ?? 1)
      const scaleY = Number(args[2] ?? 1)
      const positions = Array.isArray(args[3]) || ArrayBuffer.isView(args[3]) ? Array.from(args[3] as ArrayLike<number>) : []
      for (let cursor = 0; cursor + 1 < positions.length; cursor += 2) {
        const repeated = multiplyMatrices(current, [scaleX, 0, 0, scaleY, Number(positions[cursor]), Number(positions[cursor + 1])])
        const box = placementBox(repeated, viewport)
        if (box) placements.push({ objectKey: `${String(reference)}:${cursor / 2}`, imageReference: reference, box, operationIndex: index })
      }
      continue
    }

    const box = placementBox(current, viewport)
    if (!box) continue
    const reference = args[0]
    placements.push({ objectKey: `${String(reference ?? "inline")}:${index}`, imageReference: reference, box, operationIndex: index })
  }

  return { placements, hasImageOperations }
}

function decodeImageElement(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = "async"
    image.addEventListener("load", () => resolve(image), { once: true })
    image.addEventListener("error", () => reject(new Error("Unable to decode extracted PDF image.")), { once: true })
    image.src = dataUrl
  })
}

function canvasForImage(width: number, height: number, maxDimension: number) {
  const scale = Math.min(1, maxDimension / Math.max(1, width, height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext("2d", { alpha: false })
  if (!context) throw new Error("Unable to create an image canvas.")
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, canvas.width, canvas.height)
  return { canvas, context }
}

function imageDataToRgba(imageObject: any, pdfjs: PdfJsLibrary) {
  const width = Number(imageObject?.width ?? imageObject?.bitmap?.width ?? 0)
  const height = Number(imageObject?.height ?? imageObject?.bitmap?.height ?? 0)
  const source = imageObject?.data
  if (!width || !height || !source) return null
  const data = source instanceof Uint8ClampedArray ? source : new Uint8ClampedArray(source)
  const pixelCount = width * height
  const rgba = new Uint8ClampedArray(pixelCount * 4)
  const imageKind = pdfjs.ImageKind ?? {}
  const kind = imageObject?.kind

  if (kind === imageKind.RGBA_32BPP || data.length >= pixelCount * 4) {
    rgba.set(data.subarray(0, pixelCount * 4))
    return { width, height, rgba }
  }
  if (kind === imageKind.RGB_24BPP || data.length >= pixelCount * 3) {
    for (let index = 0; index < pixelCount; index += 1) {
      rgba[index * 4] = data[index * 3]
      rgba[index * 4 + 1] = data[index * 3 + 1]
      rgba[index * 4 + 2] = data[index * 3 + 2]
      rgba[index * 4 + 3] = 255
    }
    return { width, height, rgba }
  }
  if (kind === imageKind.GRAYSCALE_1BPP || data.length <= Math.ceil(pixelCount / 8) + 8) {
    for (let index = 0; index < pixelCount; index += 1) {
      const bit = (data[Math.floor(index / 8)] >> (7 - (index % 8))) & 1
      const value = bit ? 0 : 255
      rgba[index * 4] = value
      rgba[index * 4 + 1] = value
      rgba[index * 4 + 2] = value
      rgba[index * 4 + 3] = 255
    }
    return { width, height, rgba }
  }
  if (data.length >= pixelCount) {
    for (let index = 0; index < pixelCount; index += 1) {
      const value = data[index]
      rgba[index * 4] = value
      rgba[index * 4 + 1] = value
      rgba[index * 4 + 2] = value
      rgba[index * 4 + 3] = 255
    }
    return { width, height, rgba }
  }
  return null
}

async function pdfImageObjectToDataUrl(imageObject: any, pdfjs: PdfJsLibrary, maxDimension: number) {
  if (!imageObject) return null
  if (typeof imageObject.dataUrl === "string" && imageObject.dataUrl.startsWith("data:image/")) return imageObject.dataUrl
  const bitmap = imageObject.bitmap ?? (typeof ImageBitmap !== "undefined" && imageObject instanceof ImageBitmap ? imageObject : null)
  if (bitmap) {
    const { canvas, context } = canvasForImage(Number(bitmap.width), Number(bitmap.height), maxDimension)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/jpeg", 0.86)
  }
  const decoded = imageDataToRgba(imageObject, pdfjs)
  if (!decoded) return null
  const sourceCanvas = document.createElement("canvas")
  sourceCanvas.width = decoded.width
  sourceCanvas.height = decoded.height
  const sourceContext = sourceCanvas.getContext("2d")
  if (!sourceContext) return null
  sourceContext.putImageData(new ImageData(decoded.rgba, decoded.width, decoded.height), 0, 0)
  const { canvas, context } = canvasForImage(decoded.width, decoded.height, maxDimension)
  context.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/jpeg", 0.86)
}

async function renderPagePreview(page: any, targetWidth: number): Promise<RenderedPagePreview | null> {
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
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.84), width: canvas.width, height: canvas.height }
}

async function cropPagePreview(preview: RenderedPagePreview, box: ImageBox, maxDimension: number) {
  const image = await decodeImageElement(preview.dataUrl)
  const padding = 0.012
  const leftRatio = Math.max(0, box.xRatio - padding)
  const topRatio = Math.max(0, box.yRatio - padding)
  const rightRatio = Math.min(1, box.xRatio + box.widthRatio + padding)
  const bottomRatio = Math.min(1, box.yRatio + box.heightRatio + padding)
  const sourceX = Math.floor(leftRatio * image.naturalWidth)
  const sourceY = Math.floor(topRatio * image.naturalHeight)
  const sourceWidth = Math.max(1, Math.ceil((rightRatio - leftRatio) * image.naturalWidth))
  const sourceHeight = Math.max(1, Math.ceil((bottomRatio - topRatio) * image.naturalHeight))
  const { canvas, context } = canvasForImage(sourceWidth, sourceHeight, maxDimension)
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/jpeg", 0.86)
}

async function extractPageImages(input: {
  pdfjs: PdfJsLibrary
  page: any
  pageNumber: number
  operatorList: any
  textLines: PositionedTextLine[]
  pageText: string
  viewport: any
  targetWidth: number
}) {
  const placementResult = collectImagePlacements(input.pdfjs, input.page, input.operatorList, input.viewport)
  if (!placementResult.hasImageOperations) return { images: [] as ExtractedPdfImage[], hasImages: false, preview: null as RenderedPagePreview | null, complete: true }

  const sortedPlacements = placementResult.placements
    .filter((placement, index, values) => values.findIndex((candidate) =>
      Math.abs(candidate.box.xRatio - placement.box.xRatio) < 0.002 &&
      Math.abs(candidate.box.yRatio - placement.box.yRatio) < 0.002 &&
      Math.abs(candidate.box.widthRatio - placement.box.widthRatio) < 0.002 &&
      Math.abs(candidate.box.heightRatio - placement.box.heightRatio) < 0.002
    ) === index)
    .sort((left, right) => left.box.yRatio - right.box.yRatio || left.box.xRatio - right.box.xRatio || left.operationIndex - right.operationIndex)

  let preview: RenderedPagePreview | null = null
  const images: ExtractedPdfImage[] = []
  for (let index = 0; index < sortedPlacements.length; index += 1) {
    const placement = sortedPlacements[index]
    const resolved = await resolvePdfImageObject(input.page, placement.imageReference)
    let dataUrl = await pdfImageObjectToDataUrl(resolved, input.pdfjs, 1_800).catch(() => null)
    if (!dataUrl) {
      preview ??= await renderPagePreview(input.page, Math.max(1_100, input.targetWidth))
      if (preview) dataUrl = await cropPagePreview(preview, placement.box, 1_800).catch(() => null)
    }
    if (!dataUrl) continue
    const caption = findImageCaption(input.textLines, placement.box, input.viewport)
    images.push({
      id: `page-${input.pageNumber}-image-${index + 1}`,
      pageNumber: input.pageNumber,
      order: index + 1,
      dataUrl,
      sourceCaption: caption,
      contextText: caption || input.pageText.slice(0, 1_500),
      sectionHint: inferImageSection(input.textLines, placement.box, input.viewport, input.pageText),
      xRatio: placement.box.xRatio,
      yRatio: placement.box.yRatio,
      widthRatio: placement.box.widthRatio,
      heightRatio: placement.box.heightRatio,
    })
  }

  return { images, hasImages: true, preview, complete: images.length === sortedPlacements.length }
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
  options: { includePageImages?: boolean; imageWidth?: number; imageMode?: "all" | "visuals" } = {},
): Promise<ExtractedSourceDocument> {
  const { pdfjs, documentProxy, loadingTask } = await loadSourcePdfDocument(data, attachment)
  const pages: ExtractedPdfPage[] = []
  try {
    for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
      const page = await documentProxy.getPage(pageNumber)
      const textContent = await page.getTextContent({ includeMarkedContent: true })
      const sourceLines = groupTextLines(textContent.items ?? [])
      const textHtml = textContentToHtml(textContent)
      const pageText = sourceLines.map((line) => line.items.map((item) => item.text).join(" ")).join("\n")
      const viewport = page.getViewport({ scale: 1 })
      let images: ExtractedPdfImage[] = []
      let hasImages = false
      let preview: RenderedPagePreview | null = null
      let imageExtractionComplete = true

      if (options.includePageImages === true) {
        try {
          const operatorList = await page.getOperatorList()
          const extracted = await extractPageImages({
            pdfjs,
            page,
            pageNumber,
            operatorList,
            textLines: positionedTextLines(sourceLines, viewport),
            pageText,
            viewport,
            targetWidth: options.imageWidth ?? 900,
          })
          images = extracted.images
          hasImages = extracted.hasImages
          preview = extracted.preview
          imageExtractionComplete = extracted.complete
        } catch {
          hasImages = true
          imageExtractionComplete = false
          preview = await renderPagePreview(page, options.imageWidth ?? 900)
        }
      }

      const shouldKeepFullPagePreview = options.includePageImages === true && (
        options.imageMode === "all" || (hasImages && !imageExtractionComplete)
      )
      if (shouldKeepFullPagePreview && !preview) {
        preview = await renderPagePreview(page, options.imageWidth ?? 900)
      }

      pages.push({
        pageNumber,
        textHtml,
        imageDataUrl: shouldKeepFullPagePreview ? preview?.dataUrl ?? null : null,
        hasImages,
        images,
        imageExtractionComplete,
      })
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
