"use client"

const HTML2PDF_SCRIPT_ID = "buildsight-html2pdf"
const HTML2PDF_SCRIPT_URL = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"
const HTML2PDF_INTEGRITY = "sha512-GsLlZN/3F2ErC5ifS5QtgpiJtWd43JWSuIgh7mbzZ8zBps+dvLusV+eNQATqgA/HdeKFVgA5v3S/cIrLF7QnIg=="

type Html2PdfWorker = {
  set(options: Record<string, unknown>): Html2PdfWorker
  from(element: HTMLElement): Html2PdfWorker
  outputPdf(type: "blob"): Promise<Blob>
}

type Html2PdfFactory = () => Html2PdfWorker

declare global {
  interface Window {
    html2pdf?: Html2PdfFactory
  }
}

let loaderPromise: Promise<Html2PdfFactory> | null = null

function loadHtml2Pdf() {
  if (typeof window === "undefined") return Promise.reject(new Error("PDF export is available only in the browser."))
  if (window.html2pdf) return Promise.resolve(window.html2pdf)
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
      window.setTimeout(resolve, 8_000)
    })
  }))
}

function safeFilename(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized || "project"
}

export async function exportSummaryPdf({
  source,
  projectName,
  projectReference,
  language,
}: {
  source: HTMLElement
  projectName: string
  projectReference: string | null
  language: "en" | "ar"
}) {
  const html2pdf = await loadHtml2Pdf()
  await document.fonts?.ready

  const host = document.createElement("div")
  host.setAttribute("aria-hidden", "true")
  host.dir = language === "ar" ? "rtl" : "ltr"
  host.style.position = "fixed"
  host.style.inset = "0 auto auto -10000px"
  host.style.width = "794px"
  host.style.zIndex = "-1"
  host.style.background = "#ffffff"

  const clone = source.cloneNode(true) as HTMLElement
  clone.classList.add("ai-summary-pdf-export")
  clone.style.width = "794px"
  clone.style.maxWidth = "794px"
  clone.style.border = "0"
  clone.style.borderRadius = "0"
  clone.style.boxShadow = "none"
  clone.style.background = "#ffffff"
  host.appendChild(clone)
  document.body.appendChild(host)

  try {
    await waitForImages(clone)
    const filenameBase = safeFilename(projectReference || projectName)
    const filename = `${filenameBase}-ai-summary-${language}.pdf`
    const options = {
      margin: [10, 10, 12, 10],
      filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0,
        windowWidth: 794,
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"], avoid: [".ai-summary-no-break", "table", "tr", "img"] },
    }

    const blob = await html2pdf().set(options).from(clone).outputPdf("blob")
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    link.style.display = "none"
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
  } finally {
    host.remove()
  }
}
