"use client"

const PDFJS_SCRIPT_ID = "buildsight-pdfjs"
const PDFJS_SCRIPT_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"

export type PdfPageViewPort = {
  width: number
  height: number
  scale: number
  rotation: number
}

export type PdfRenderTask = {
  promise: Promise<void>
  cancel?: () => void
}

export type PdfPageProxy = {
  pageNumber: number
  getViewport: (params: { scale: number; rotation?: number }) => PdfPageViewPort
  render: (params: {
    canvasContext: CanvasRenderingContext2D
    viewport: PdfPageViewPort
    transform?: number[]
    background?: string
  }) => PdfRenderTask
  cleanup?: () => void
}

export type PdfDocumentProxy = {
  numPages: number
  getPage: (pageNumber: number) => Promise<PdfPageProxy>
  destroy?: () => void
}

export type PdfLoadingTask = {
  promise: Promise<PdfDocumentProxy>
  destroy?: () => void
}

export type PdfJsLibrary = {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument: (source: string | { url?: string; data?: Uint8Array | ArrayBuffer }) => PdfLoadingTask
}

type PdfJsWindow = Window & { pdfjsLib?: PdfJsLibrary }

let pdfJsPromise: Promise<PdfJsLibrary> | null = null

export function loadPdfJs(): Promise<PdfJsLibrary> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("PDF viewing is available only in the browser."))
  }
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
