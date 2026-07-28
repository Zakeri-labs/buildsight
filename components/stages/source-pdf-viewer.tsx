"use client"

import { useEffect, useRef, useState } from "react"
import { ExternalLink, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { loadSourcePdfDocument } from "@/lib/stage-translations/client-source-pdf"
import { stageSourceDocumentUrl } from "@/lib/stage-translations/source-document"
import type { ProjectStageAttachment } from "@/lib/db/project-stages"
import type { StageTranslationPageData } from "@/lib/stage-translations/types"

function PdfPage({ pdfjs, documentProxy, pageNumber }: { pdfjs: any; documentProxy: any; pageNumber: number }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [shouldRender, setShouldRender] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldRender(true)
        observer.disconnect()
      }
    }, { rootMargin: "900px 0px" })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!shouldRender) return
    const host = hostRef.current
    const canvas = canvasRef.current
    const textLayer = textLayerRef.current
    if (!host || !canvas || !textLayer) return

    let disposed = false
    let renderTask: any = null
    let resizeTimer: number | null = null

    async function renderPage() {
      try {
        const page = await documentProxy.getPage(pageNumber)
        if (disposed) return
        const baseViewport = page.getViewport({ scale: 1 })
        const availableWidth = Math.max(260, host.clientWidth - 2)
        const scale = availableWidth / Math.max(1, baseViewport.width)
        const viewport = page.getViewport({ scale })
        const outputScale = Math.min(2, window.devicePixelRatio || 1)
        const context = canvas.getContext("2d", { alpha: false })
        if (!context) throw new Error("Canvas rendering is not supported in this browser.")

        renderTask?.cancel?.()
        canvas.width = Math.max(1, Math.floor(viewport.width * outputScale))
        canvas.height = Math.max(1, Math.floor(viewport.height * outputScale))
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`
        textLayer.style.width = `${Math.floor(viewport.width)}px`
        textLayer.style.height = `${Math.floor(viewport.height)}px`
        textLayer.replaceChildren()

        context.setTransform(1, 0, 0, 1, 0, 0)
        context.fillStyle = "#ffffff"
        context.fillRect(0, 0, canvas.width, canvas.height)
        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
          background: "#ffffff",
        })
        await renderTask.promise
        if (disposed) return

        const textContent = await page.getTextContent({ includeMarkedContent: true })
        if (disposed || !pdfjs.renderTextLayer) return
        const textTask = pdfjs.renderTextLayer({
          textContentSource: textContent,
          container: textLayer,
          viewport,
          textDivs: [],
        })
        if (textTask?.promise) await textTask.promise
        else if (textTask instanceof Promise) await textTask
        page.cleanup?.()
      } catch (renderError) {
        const errorName = renderError && typeof renderError === "object" && "name" in renderError
          ? String((renderError as { name?: unknown }).name ?? "")
          : ""
        if (!disposed && errorName !== "RenderingCancelledException") {
          setError(renderError instanceof Error ? renderError.message : "Unable to render this PDF page.")
        }
      }
    }

    const observer = new ResizeObserver(() => {
      if (resizeTimer) window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => void renderPage(), 120)
    })
    observer.observe(host)
    void renderPage()

    return () => {
      disposed = true
      observer.disconnect()
      if (resizeTimer) window.clearTimeout(resizeTimer)
      renderTask?.cancel?.()
    }
  }, [documentProxy, pageNumber, pdfjs, shouldRender])

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-100 p-2 shadow-sm">
      <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold text-slate-500">
        <span>Page {pageNumber}</span>
        <span>Selectable text layer</span>
      </div>
      <div ref={hostRef} className="relative min-h-[420px] w-full overflow-hidden bg-white">
        {!shouldRender ? <div className="flex min-h-[420px] items-center justify-center text-xs text-slate-500">Page loads as you scroll</div> : null}
        <canvas ref={canvasRef} className="block max-w-full" aria-label={`Original PDF page ${pageNumber}`} />
        <div ref={textLayerRef} className="source-pdf-text-layer" aria-hidden="true" />
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </section>
  )
}

export function SourcePdfViewer({
  data,
  attachment,
  title,
}: {
  data: StageTranslationPageData
  attachment: ProjectStageAttachment
  title: string
}) {
  const [state, setState] = useState<{
    status: "loading" | "ready" | "error"
    pdfjs: any | null
    documentProxy: any | null
    loadingTask: any | null
    message: string | null
  }>({ status: "loading", pdfjs: null, documentProxy: null, loadingTask: null, message: null })

  useEffect(() => {
    let disposed = false
    let loaded: Awaited<ReturnType<typeof loadSourcePdfDocument>> | null = null
    void loadSourcePdfDocument(data, attachment)
      .then((result) => {
        loaded = result
        if (!disposed) setState({ status: "ready", pdfjs: result.pdfjs, documentProxy: result.documentProxy, loadingTask: result.loadingTask, message: null })
      })
      .catch((loadError) => {
        if (!disposed) setState({ status: "error", pdfjs: null, documentProxy: null, loadingTask: null, message: loadError instanceof Error ? loadError.message : "Unable to load the original PDF." })
      })

    return () => {
      disposed = true
      loaded?.documentProxy?.destroy?.()
      loaded?.loadingTask?.destroy?.()
    }
  }, [attachment, data])

  const sourceUrl = stageSourceDocumentUrl(data, attachment)

  return (
    <article lang="en" dir="ltr" className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-sm">
      <div className="h-2 bg-blue-700" />
      <header className="border-b border-slate-200 bg-slate-50 px-5 py-5 sm:px-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-blue-700"><FileText className="size-4" />{title}</div>
            <h2 className="truncate text-2xl font-bold tracking-tight text-slate-950">{attachment.originalFilename}</h2>
            <p className="mt-1 text-sm text-slate-600">Original uploaded inspection PDF · Text, tables, and images preserved</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.open(sourceUrl, "_blank", "noopener,noreferrer")}>
            <ExternalLink className="size-4" />Open PDF
          </Button>
        </div>
      </header>

      <div className="space-y-4 px-3 py-4 sm:px-5 sm:py-5">
        {state.status === "loading" ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center text-center text-sm text-slate-600">
            <Loader2 className="mb-3 size-7 animate-spin text-blue-700" />
            Loading and extracting the original PDF…
          </div>
        ) : null}
        {state.status === "error" ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-start text-xs text-amber-800">
              <span>{state.message} The browser PDF viewer is shown as a fallback.</span>
              <Button variant="outline" size="sm" onClick={() => window.open(sourceUrl, "_blank", "noopener,noreferrer")}><ExternalLink className="size-4" />Open PDF</Button>
            </div>
            <iframe title={attachment.originalFilename} src={sourceUrl} className="min-h-[720px] w-full rounded-lg border border-slate-200 bg-white" />
          </div>
        ) : null}
        {state.status === "ready" && state.documentProxy ? Array.from({ length: state.documentProxy.numPages }, (_, index) => (
          <PdfPage key={index + 1} pdfjs={state.pdfjs} documentProxy={state.documentProxy} pageNumber={index + 1} />
        )) : null}
      </div>

      <footer className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-center text-[11px] text-slate-500 sm:px-7">
        {data.project.name} · {data.response.reportNumber} · {attachment.originalFilename}
      </footer>
    </article>
  )
}
