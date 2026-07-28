"use client"

const HTML2PDF_SCRIPT_ID = "buildsight-html2pdf"
const HTML2PDF_SCRIPT_URL = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"
const HTML2PDF_INTEGRITY = "sha512-GsLlZN/3F2ErC5ifS5QtgpiJtWd43JWSuIgh7mbzZ8zBps+dvLusV+eNQATqgA/HdeKFVgA5v3S/cIrLF7QnIg=="

declare global {
  interface Window {
    html2pdf?: () => any
  }
}

let loaderPromise: Promise<NonNullable<Window["html2pdf"]>> | null = null

function loadHtml2Pdf() {
  if (typeof window === "undefined") return Promise.reject(new Error("PDF export is available only in the browser."))
  if (window.html2pdf) return Promise.resolve(window.html2pdf)
  if (loaderPromise) return loaderPromise

  loaderPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(HTML2PDF_SCRIPT_ID) as HTMLScriptElement | null
    const script = existing ?? document.createElement("script")
    const timeout = window.setTimeout(() => {
      loaderPromise = null
      reject(new Error("PDF tools did not load. Check the network connection and try again."))
    }, 20_000)

    const finish = () => {
      window.clearTimeout(timeout)
      if (!window.html2pdf) {
        loaderPromise = null
        reject(new Error("PDF tools failed to initialize. Refresh the page and try again."))
        return
      }
      resolve(window.html2pdf)
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
      window.setTimeout(resolve, 10_000)
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
  clone.classList.add("stage-translation-pdf-export")
  clone.style.width = `${width}px`
  clone.style.maxWidth = `${width}px`
  clone.style.border = "0"
  clone.style.borderRadius = "0"
  clone.style.boxShadow = "none"
  clone.style.background = "#ffffff"
  host.appendChild(clone)
  document.body.appendChild(host)

  try {
    await waitForImages(clone)
    const base = safeFilename(projectReference || projectName)
    const suffix = kind === "original" ? "english-original" : kind === "arabic" ? "arabic-translation" : "bilingual"
    const filename = `${base}-${safeFilename(documentNumber)}-${suffix}.pdf`
    const options = {
      margin: [10, 10, 14, 10],
      filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0,
        windowWidth: width,
      },
      jsPDF: { unit: "mm", format: "a4", orientation: landscape ? "landscape" : "portrait" },
      pagebreak: { mode: ["css", "legacy"], avoid: [".stage-translation-no-break", "table", "tr", "figure", "img"] },
    }

    const worker = html2pdf().set(options).from(clone).toPdf()
    const pdf = await worker.get("pdf")
    const pageCount = pdf.internal.getNumberOfPages()
    for (let page = 1; page <= pageCount; page += 1) {
      pdf.setPage(page)
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      pdf.setFontSize(8)
      pdf.setTextColor(100)
      pdf.text(`${page} / ${pageCount}`, pageWidth / 2, pageHeight - 5, { align: "center" })
    }
    const blob = pdf.output("blob") as Blob
    downloadBlob(blob, filename)
    return { blob, filename }
  } finally {
    host.remove()
  }
}
