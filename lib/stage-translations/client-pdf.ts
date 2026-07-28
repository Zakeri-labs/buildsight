"use client"

import { extractSourcePdf } from "@/lib/stage-translations/client-source-pdf"
import { buildTranslationPdfDocument, type PdfKind } from "@/lib/stage-translations/pdf-templates"
import { getSourcePdfAttachment, stageSourceDocumentUrl } from "@/lib/stage-translations/source-document"
import type { StageTranslationPageData, StageTranslationRecord } from "@/lib/stage-translations/types"

const HTML2PDF_SCRIPT_ID = "buildsight-html2pdf"
const HTML2PDF_SCRIPT_URL = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"
const HTML2PDF_INTEGRITY = "sha512-GsLlZN/3F2ErC5ifS5QtgpiJtWd43JWSuIgh7mbzZ8zBps+dvLusV+eNQATqgA/HdeKFVgA5v3S/cIrLF7QnIg=="
const MAX_CANVAS_DIMENSION = 30_000

type Html2PdfFactory = () => any
type PdfFrameWindow = Window & { html2pdf?: Html2PdfFactory }

function loadHtml2PdfInFrame(iframe: HTMLIFrameElement) {
  return new Promise<Html2PdfFactory>((resolve, reject) => {
    const frameDocument = iframe.contentDocument
    const frameWindow = iframe.contentWindow as PdfFrameWindow | null
    if (!frameDocument || !frameWindow) {
      reject(new Error("The isolated PDF renderer is unavailable."))
      return
    }
    if (frameWindow.html2pdf) {
      resolve(frameWindow.html2pdf)
      return
    }

    const script = frameDocument.createElement("script")
    const timeout = window.setTimeout(() => {
      script.remove()
      reject(new Error("PDF tools did not load inside the isolated renderer."))
    }, 20_000)
    const finish = () => {
      window.clearTimeout(timeout)
      if (!frameWindow.html2pdf) {
        reject(new Error("PDF tools failed to initialize inside the isolated renderer."))
        return
      }
      resolve(frameWindow.html2pdf)
    }
    const fail = () => {
      window.clearTimeout(timeout)
      script.remove()
      reject(new Error("PDF tools could not be loaded inside the isolated renderer."))
    }

    script.id = HTML2PDF_SCRIPT_ID
    script.src = HTML2PDF_SCRIPT_URL
    script.async = true
    script.crossOrigin = "anonymous"
    script.referrerPolicy = "no-referrer"
    script.integrity = HTML2PDF_INTEGRITY
    script.addEventListener("load", finish, { once: true })
    script.addEventListener("error", fail, { once: true })
    frameDocument.head.appendChild(script)
  })
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

async function waitForImages(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll("img"))
  await Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const finish = () => resolve()
      image.addEventListener("load", finish, { once: true })
      image.addEventListener("error", finish, { once: true })
      window.setTimeout(finish, 20_000)
    })
  }))
}

function assertPdfSafeDocument(html: string) {
  const css = [
    ...Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi), (match) => match[1]),
    ...Array.from(html.matchAll(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi), (match) => match[2]),
  ].join("\n")
  const unsupported = css.match(/\b(?:lab|lch|oklab|oklch|color-mix|light-dark|var)\s*\(/i)
  if (unsupported) throw new Error(`PDF template contains unsupported CSS: ${unsupported[0]}`)
  if (/--tw-|@tailwind/i.test(css)) throw new Error("PDF template must not contain application or Tailwind styles.")
}

function mountPdfTemplate(html: string, width: number) {
  return new Promise<{ iframe: HTMLIFrameElement; root: HTMLElement; html2pdf: Html2PdfFactory }>((resolve, reject) => {
    const iframe = document.createElement("iframe")
    iframe.setAttribute("aria-hidden", "true")
    iframe.setAttribute("tabindex", "-1")
    iframe.setAttribute("sandbox", "allow-same-origin allow-scripts")
    iframe.style.position = "fixed"
    iframe.style.left = "-20000px"
    iframe.style.top = "0"
    iframe.style.width = `${width}px`
    iframe.style.height = "1200px"
    iframe.style.border = "0"
    iframe.style.background = "#ffffff"
    iframe.style.pointerEvents = "none"
    iframe.style.zIndex = "-1"

    const timeout = window.setTimeout(() => {
      iframe.remove()
      reject(new Error("The PDF template did not finish loading."))
    }, 20_000)

    iframe.addEventListener("load", () => {
      window.clearTimeout(timeout)
      const frameDocument = iframe.contentDocument
      const root = frameDocument?.getElementById("pdf-root") as HTMLElement | null
      if (!frameDocument || !root) {
        iframe.remove()
        reject(new Error("The PDF template could not be initialized."))
        return
      }
      void loadHtml2PdfInFrame(iframe)
        .then((html2pdf) => resolve({ iframe, root, html2pdf }))
        .catch((loadError) => {
          iframe.remove()
          reject(loadError)
        })
    }, { once: true })

    iframe.srcdoc = html
    document.body.appendChild(iframe)
  })
}

async function exportOriginalUploadedPdf(data: StageTranslationPageData) {
  const sourcePdf = getSourcePdfAttachment(data)
  if (!sourcePdf) return null
  const response = await fetch(stageSourceDocumentUrl(data, sourcePdf), { cache: "no-store" })
  if (!response.ok) throw new Error("Unable to load the original uploaded PDF.")
  const blob = await response.blob()
  const filename = sourcePdf.originalFilename.toLowerCase().endsWith(".pdf")
    ? sourcePdf.originalFilename
    : `${safeFilename(sourcePdf.originalFilename)}.pdf`
  downloadBlob(blob, filename)
  return { blob, filename }
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
  if (kind === "original") {
    const sourceExport = await exportOriginalUploadedPdf(data)
    if (sourceExport) return sourceExport
  }

  const sourcePdf = getSourcePdfAttachment(data)
  let extractedSource = null
  if (sourcePdf && kind === "bilingual") {
    try {
      extractedSource = await extractSourcePdf(data, sourcePdf, { includePageImages: true, imageWidth: 520 })
    } catch {
      // A source-PDF preview improves the bilingual export, but structured report export remains available if extraction fails.
      extractedSource = null
    }
  }

  const html = buildTranslationPdfDocument({
    kind,
    data,
    translation,
    sourceDocument: extractedSource,
  })
  assertPdfSafeDocument(html)

  const landscape = kind === "bilingual"
  const width = landscape ? 1123 : 794
  const { iframe, root, html2pdf } = await mountPdfTemplate(html, width)

  try {
    await iframe.contentDocument?.fonts?.ready
    await waitForImages(root)
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))

    const base = safeFilename(data.project.code || data.project.name)
    const suffix = kind === "original" ? "english-original" : kind === "arabic" ? "arabic-translation" : "bilingual"
    const filename = `${base}-${safeFilename(data.response.reportNumber)}-${suffix}.pdf`
    const renderHeight = Math.max(root.scrollHeight, root.getBoundingClientRect().height, 1)
    iframe.style.height = `${Math.ceil(renderHeight + 20)}px`
    const scale = Math.min(2, MAX_CANVAS_DIMENSION / Math.max(width, renderHeight))

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
        imageTimeout: 20_000,
        logging: false,
        removeContainer: true,
      },
      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: landscape ? "landscape" : "portrait",
        compress: true,
      },
      pagebreak: {
        mode: ["css", "legacy"],
        avoid: [".no-break", "table", "tr", "figure", "img", ".source-page", ".approval"],
      },
    }

    const worker = (html2pdf() as any).set(options).from(root).toPdf()
    const pdf = await worker.get("pdf")
    const pageCount = pdf.internal.getNumberOfPages()
    for (let page = 1; page <= pageCount; page += 1) {
      pdf.setPage(page)
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      pdf.setFont("helvetica", "normal")
      pdf.setFontSize(8)
      pdf.setTextColor(100, 116, 139)
      pdf.text(`${page} / ${pageCount}`, pageWidth / 2, pageHeight - 5, { align: "center" })
    }

    const blob = pdf.output("blob") as Blob
    downloadBlob(blob, filename)
    return { blob, filename }
  } finally {
    iframe.remove()
  }
}
