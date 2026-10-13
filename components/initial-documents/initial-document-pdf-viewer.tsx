"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useI18n } from "@/lib/i18n"
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Maximize2,
  Minus,
  Plus,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { loadPdfJs, type PdfDocumentProxy, type PdfPageProxy, type PdfRenderTask } from "@/lib/initial-documents/client-pdf"
import { cn } from "@/lib/utils"

const MIN_ZOOM = 0.5
const MAX_ZOOM = 3.0
const ZOOM_STEP = 0.25

export function InitialDocumentPdfViewer({
  documentId,
  fileName,
  fallbackHref,
}: {
  documentId: string
  fileName: string
  fallbackHref: string
}) {
  const { locale } = useI18n()
  const isArabic = locale === "ar"

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderTaskRef = useRef<PdfRenderTask | null>(null)
  const currentPageProxyRef = useRef<PdfPageProxy | null>(null)
  const pdfDocRef = useRef<PdfDocumentProxy | null>(null)

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [numPages, setNumPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [zoomRatio, setZoomRatio] = useState<number>(1.0)
  const [isRenderingPage, setIsRenderingPage] = useState<boolean>(false)

  // Load PDF Document
  useEffect(() => {
    let cancelled = false

    async function initPdf() {
      try {
        setStatus("loading")
        setErrorMessage(null)

        const pdfjs = await loadPdfJs()
        if (cancelled) return

        const loadingTask = pdfjs.getDocument({
          url: `/api/initial-documents?id=${encodeURIComponent(documentId)}`,
        })

        const doc = await loadingTask.promise
        if (cancelled) {
          doc.destroy?.()
          return
        }

        pdfDocRef.current = doc
        setNumPages(doc.numPages)
        setCurrentPage(1)
        setZoomRatio(1.0)
        setStatus("ready")
      } catch (err: unknown) {
        if (cancelled) return
        console.error("PDF.js initialization error:", err)
        setStatus("error")
        setErrorMessage(err instanceof Error ? err.message : "Unable to load PDF document.")
      }
    }

    void initPdf()

    return () => {
      cancelled = true
      renderTaskRef.current?.cancel?.()
      currentPageProxyRef.current?.cleanup?.()
      pdfDocRef.current?.destroy?.()
    }
  }, [documentId])

  // Render Current Page
  const renderPage = useCallback(async (pageNumber: number, currentZoom: number) => {
    const doc = pdfDocRef.current
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!doc || !container || !canvas) return

    // Cancel any active render task before starting a new one
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel?.()
      renderTaskRef.current = null
    }

    setIsRenderingPage(true)

    try {
      // Clean up previous page resources
      if (currentPageProxyRef.current && currentPageProxyRef.current.pageNumber !== pageNumber) {
        currentPageProxyRef.current.cleanup?.()
      }

      const page = await doc.getPage(pageNumber)
      currentPageProxyRef.current = page

      const baseViewport = page.getViewport({ scale: 1 })
      const containerWidth = Math.max(260, container.clientWidth - 16)
      const fitScale = containerWidth / Math.max(1, baseViewport.width)
      const scale = fitScale * currentZoom

      // Cap devicePixelRatio to 1.5 to bound memory usage on high-DPI mobile devices
      const outputScale = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 1.5)
      const viewport = page.getViewport({ scale })

      canvas.width = Math.max(1, Math.floor(viewport.width * outputScale))
      canvas.height = Math.max(1, Math.floor(viewport.height * outputScale))
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`

      const context = canvas.getContext("2d", { alpha: false })
      if (!context) {
        throw new Error("Canvas context is not available.")
      }

      context.setTransform(1, 0, 0, 1, 0, 0)
      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, canvas.width, canvas.height)

      const renderTask = page.render({
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        background: "#ffffff",
      })

      renderTaskRef.current = renderTask
      await renderTask.promise
      renderTaskRef.current = null
      setIsRenderingPage(false)
    } catch (err: unknown) {
      const errorName = err && typeof err === "object" && "name" in err
        ? String((err as { name?: unknown }).name ?? "")
        : ""
      if (errorName === "RenderingCancelledException") {
        // Ignored: expected when zoom or page changed during rendering
        return
      }
      console.error("Page render error:", err)
      setIsRenderingPage(false)
      setStatus("error")
      setErrorMessage(err instanceof Error ? err.message : "Unable to render PDF page.")
    }
  }, [])

  // Trigger render when status is ready, currentPage changes, or zoom changes
  useEffect(() => {
    if (status !== "ready") return
    void renderPage(currentPage, zoomRatio)
  }, [status, currentPage, zoomRatio, renderPage])

  // Handle container resize (e.g., orientation change)
  useEffect(() => {
    if (status !== "ready") return
    const container = containerRef.current
    if (!container) return

    let timeoutId: number
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(() => {
        void renderPage(currentPage, zoomRatio)
      }, 200)
    })

    observer.observe(container)
    return () => {
      window.clearTimeout(timeoutId)
      observer.disconnect()
    }
  }, [status, currentPage, zoomRatio, renderPage])

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back()
    } else {
      window.location.href = fallbackHref
    }
  }

  const handleZoomIn = () => {
    setZoomRatio((prev) => Math.min(MAX_ZOOM, Number((prev + ZOOM_STEP).toFixed(2))))
  }

  const handleZoomOut = () => {
    setZoomRatio((prev) => Math.max(MIN_ZOOM, Number((prev - ZOOM_STEP).toFixed(2))))
  }

  const handleFitWidth = () => {
    setZoomRatio(1.0)
  }

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1))
  }

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(numPages, prev + 1))
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-[75vh] flex-col items-center justify-center p-4">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="mt-3 text-sm font-medium text-muted-foreground">
          {isArabic ? "جارٍ تحميل المستند..." : "Loading document..."}
        </p>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center p-4">
        <Card className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-sm">
          <CardContent className="flex flex-col items-center p-0">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <FileText className="size-7" />
            </div>

            <h1 className="mt-4 text-xl font-bold tracking-tight text-foreground">
              {isArabic ? "تعذر عرض المستند" : "Unable to Display Document"}
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              {errorMessage || (isArabic ? "تعذر عرض هذا الملف." : "This PDF could not be displayed.")}
            </p>

            <div className="mt-6 flex w-full flex-col gap-2.5">
              <a
                href={`/api/initial-documents?id=${encodeURIComponent(documentId)}&download=1`}
                className={cn(buttonVariants({ size: "lg" }), "w-full gap-2 rounded-xl font-medium")}
              >
                <Download className="size-4" />
                {isArabic ? "تنزيل ملف PDF" : "Download PDF"}
              </a>

              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={handleBack}
                className="w-full gap-2 rounded-xl"
              >
                {isArabic ? <ArrowRight className="size-4" /> : <ArrowLeft className="size-4" />}
                {isArabic ? "رجوع" : "Back"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const zoomPercentage = Math.round(zoomRatio * 100)

  return (
    <div className="relative flex h-[calc(100dvh-4rem)] w-full flex-col overflow-hidden bg-background">
      {/* Top Toolbar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b bg-card px-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="size-9 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
            title={isArabic ? "رجوع" : "Back"}
            aria-label={isArabic ? "رجوع" : "Back"}
          >
            {isArabic ? <ArrowRight className="size-4" /> : <ArrowLeft className="size-4" />}
          </Button>
          <h1 className="truncate text-xs font-semibold text-foreground sm:text-sm" title={fileName}>
            {fileName}
          </h1>
        </div>

        <a
          href={`/api/initial-documents?id=${encodeURIComponent(documentId)}&download=1`}
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "size-9 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
          )}
          title={isArabic ? "تنزيل" : "Download"}
          aria-label={isArabic ? "تنزيل" : "Download"}
        >
          <Download className="size-4" />
        </a>
      </header>

      {/* Main Viewer Canvas Area */}
      <main
        ref={containerRef}
        className="relative flex flex-1 items-start justify-center overflow-auto bg-muted/30 p-2 text-center"
      >
        <div className="relative my-auto inline-block shadow-sm">
          <canvas ref={canvasRef} className="block rounded-sm bg-white" />
          {isRenderingPage ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/40 backdrop-blur-[1px]">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : null}
        </div>
      </main>

      {/* Bottom Toolbar */}
      <footer className="flex h-12 shrink-0 items-center justify-between border-t bg-card px-2.5 sm:px-4">
        {/* Page Navigation */}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handlePrevPage}
            disabled={currentPage <= 1 || isRenderingPage}
            className="size-8 rounded-lg"
            title={isArabic ? "الصفحة السابقة" : "Previous Page"}
            aria-label={isArabic ? "الصفحة السابقة" : "Previous Page"}
          >
            <ChevronLeft className="size-4" />
          </Button>

          <span className="min-w-[4rem] text-center text-xs font-medium text-muted-foreground">
            {currentPage} / {numPages || 1}
          </span>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleNextPage}
            disabled={currentPage >= numPages || isRenderingPage}
            className="size-8 rounded-lg"
            title={isArabic ? "الصفحة التالية" : "Next Page"}
            aria-label={isArabic ? "الصفحة التالية" : "Next Page"}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleZoomOut}
            disabled={zoomRatio <= MIN_ZOOM || isRenderingPage}
            className="size-8 rounded-lg"
            title={isArabic ? "تصغير" : "Zoom Out"}
            aria-label={isArabic ? "تصغير" : "Zoom Out"}
          >
            <Minus className="size-3.5" />
          </Button>

          <span className="w-11 text-center text-xs font-semibold tabular-nums text-foreground">
            {zoomPercentage}%
          </span>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleZoomIn}
            disabled={zoomRatio >= MAX_ZOOM || isRenderingPage}
            className="size-8 rounded-lg"
            title={isArabic ? "تكبير" : "Zoom In"}
            aria-label={isArabic ? "تكبير" : "Zoom In"}
          >
            <Plus className="size-3.5" />
          </Button>

          <Button
            type="button"
            variant={zoomRatio === 1.0 ? "secondary" : "ghost"}
            size="icon"
            onClick={handleFitWidth}
            disabled={isRenderingPage}
            className="size-8 rounded-lg"
            title={isArabic ? "ملاءمة العرض" : "Fit Width"}
            aria-label={isArabic ? "ملاءمة العرض" : "Fit Width"}
          >
            <Maximize2 className="size-3.5" />
          </Button>
        </div>
      </footer>
    </div>
  )
}
