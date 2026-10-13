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
  Maximize,
  Maximize2,
  Minimize,
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

  const rootRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasWrapperRef = useRef<HTMLDivElement>(null)
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

  // Fullscreen support state
  const [isFullscreenSupported, setIsFullscreenSupported] = useState<boolean>(false)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)

  // Gesture tracking refs
  const isPinchingRef = useRef<boolean>(false)
  const startPinchDistRef = useRef<number>(0)
  const startPinchZoomRef = useRef<number>(1.0)
  const currentPinchZoomRef = useRef<number>(1.0)
  const pinchFocalRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const zoomRatioRef = useRef<number>(1.0)
  zoomRatioRef.current = zoomRatio

  // Check Fullscreen capability on mount
  useEffect(() => {
    if (typeof document === "undefined") return

    const doc = document as Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element }
    const root = rootRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> }) | null

    const supported = Boolean(
      (document.fullscreenEnabled || doc.webkitFullscreenEnabled) &&
      root &&
      (root.requestFullscreen || root.webkitRequestFullscreen)
    )
    setIsFullscreenSupported(supported)

    const handleFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement || doc.webkitFullscreenElement)
      setIsFullscreen(active)
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange)

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange)
    }
  }, [])

  const toggleFullscreen = () => {
    const root = rootRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> }) | null
    const doc = document as Document & {
      webkitFullscreenElement?: Element
      webkitExitFullscreen?: () => Promise<void>
    }
    if (!root) return

    const active = Boolean(document.fullscreenElement || doc.webkitFullscreenElement)
    if (active) {
      if (document.exitFullscreen) {
        void document.exitFullscreen()
      } else if (doc.webkitExitFullscreen) {
        void doc.webkitExitFullscreen()
      }
    } else {
      if (root.requestFullscreen) {
        void root.requestFullscreen()
      } else if (root.webkitRequestFullscreen) {
        void root.webkitRequestFullscreen()
      }
    }
  }

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
      // Clean up previous page resources if changing page
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
        // Expected when zoom or page changed during rendering
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

  // Touch Event Handlers for Pinch Zoom & Swipe Navigation
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      // Two fingers: Pinch start
      isPinchingRef.current = true
      touchStartRef.current = null
      const t1 = e.touches[0]
      const t2 = e.touches[1]
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)
      startPinchDistRef.current = Math.max(10, dist)
      startPinchZoomRef.current = zoomRatioRef.current
      currentPinchZoomRef.current = zoomRatioRef.current

      const container = containerRef.current
      if (container) {
        const rect = container.getBoundingClientRect()
        pinchFocalRef.current = {
          x: (t1.clientX + t2.clientX) / 2 - rect.left,
          y: (t1.clientY + t2.clientY) / 2 - rect.top,
        }
      }
    } else if (e.touches.length === 1 && !isPinchingRef.current) {
      // One finger: Track swipe start
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      }
    }
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isPinchingRef.current && e.touches.length === 2) {
      // Prevent browser default zoom behavior
      e.preventDefault()

      const t1 = e.touches[0]
      const t2 = e.touches[1]
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)
      const scaleFactor = dist / startPinchDistRef.current
      const candidateZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, startPinchZoomRef.current * scaleFactor))
      currentPinchZoomRef.current = candidateZoom

      // Hardware-accelerated CSS preview during pinch (NO PDF.js rerender during movement)
      if (canvasWrapperRef.current) {
        const visualScale = candidateZoom / startPinchZoomRef.current
        canvasWrapperRef.current.style.transform = `scale(${visualScale.toFixed(3)})`
        canvasWrapperRef.current.style.transformOrigin = `${pinchFocalRef.current.x}px ${pinchFocalRef.current.y}px`
      }
    }
  }

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isPinchingRef.current) {
      // Reset CSS transform on pinch end
      isPinchingRef.current = false
      if (canvasWrapperRef.current) {
        canvasWrapperRef.current.style.transform = ""
        canvasWrapperRef.current.style.transformOrigin = ""
      }

      const finalZoom = Number(currentPinchZoomRef.current.toFixed(2))
      if (Math.abs(finalZoom - zoomRatioRef.current) > 0.04) {
        setZoomRatio(finalZoom)
        // Triggers exactly ONE PDF.js render at the new scale
      }
      return
    }

    // Handle horizontal swipe navigation when touch ends
    if (touchStartRef.current && e.changedTouches.length === 1) {
      const touch = e.changedTouches[0]
      const dx = touch.clientX - touchStartRef.current.x
      const dy = touch.clientY - touchStartRef.current.y
      const elapsed = Date.now() - touchStartRef.current.time
      touchStartRef.current = null

      // Swipe navigation is active ONLY when document is near Fit Width scale (zoomRatio <= 1.05)
      // When zoomed in, finger movements PAN the document instead.
      const isNearFitWidth = zoomRatioRef.current <= 1.05
      if (isNearFitWidth && elapsed < 800) {
        // Require horizontal movement of at least 60px and clear horizontal dominance (|dx| > 1.5 * |dy|)
        if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          if (dx < 0 && currentPage < numPages) {
            // Swipe LEFT -> Next Page
            setCurrentPage((p) => Math.min(numPages, p + 1))
          } else if (dx > 0 && currentPage > 1) {
            // Swipe RIGHT -> Previous Page
            setCurrentPage((p) => Math.max(1, p - 1))
          }
        }
      }
    }
  }

  const handleTouchCancel = () => {
    if (isPinchingRef.current) {
      isPinchingRef.current = false
      if (canvasWrapperRef.current) {
        canvasWrapperRef.current.style.transform = ""
        canvasWrapperRef.current.style.transformOrigin = ""
      }
    }
    touchStartRef.current = null
  }

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
      <div className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col items-center justify-center bg-background p-4">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="mt-3 text-sm font-medium text-muted-foreground">
          {isArabic ? "جارٍ تحميل المستند..." : "Loading document..."}
        </p>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col items-center justify-center bg-background p-4">
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
  const isNearFitWidth = zoomRatio <= 1.05

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col overflow-hidden bg-background select-none"
    >
      {/* Top Toolbar (Zone 1) */}
      <header className="flex shrink-0 items-center justify-between border-b bg-card/95 px-2.5 pt-[env(safe-area-inset-top,0px)] shadow-xs backdrop-blur-md sm:px-4 h-[calc(3rem+env(safe-area-inset-top,0px))]">
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

        <div className="flex items-center gap-1">
          {isFullscreenSupported ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              className="size-9 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
              title={isFullscreen ? (isArabic ? "إنهاء ملء الشاشة" : "Exit Fullscreen") : (isArabic ? "ملء الشاشة" : "Fullscreen")}
              aria-label={isFullscreen ? (isArabic ? "إنهاء ملء الشاشة" : "Exit Fullscreen") : (isArabic ? "ملء الشاشة" : "Fullscreen")}
            >
              {isFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
            </Button>
          ) : null}

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
        </div>
      </header>

      {/* Main Document Area (Zone 2) */}
      <main
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        className={cn(
          "relative flex flex-1 items-center justify-center overflow-auto bg-muted/40 p-2 text-center",
          isNearFitWidth ? "touch-pan-y" : "touch-pan-x touch-pan-y"
        )}
      >
        <div
          ref={canvasWrapperRef}
          className="relative inline-block transition-transform duration-75 ease-out shadow-md"
        >
          <canvas ref={canvasRef} className="block rounded-sm bg-white" />
          {isRenderingPage ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/40 backdrop-blur-[1px]">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : null}
        </div>
      </main>

      {/* Floating Bottom Toolbar (Zone 3) */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-border/70 bg-card/95 px-2 py-1.5 shadow-xl backdrop-blur-md">
          {/* Page Navigation */}
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handlePrevPage}
              disabled={currentPage <= 1 || isRenderingPage}
              className="size-9 rounded-xl text-foreground disabled:opacity-35"
              title={isArabic ? "الصفحة السابقة" : "Previous Page"}
              aria-label={isArabic ? "الصفحة السابقة" : "Previous Page"}
            >
              {isArabic ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
            </Button>

            <span className="min-w-[3.5rem] px-1 text-center text-xs font-semibold tabular-nums text-foreground">
              {currentPage} / {numPages || 1}
            </span>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleNextPage}
              disabled={currentPage >= numPages || isRenderingPage}
              className="size-9 rounded-xl text-foreground disabled:opacity-35"
              title={isArabic ? "الصفحة التالية" : "Next Page"}
              aria-label={isArabic ? "الصفحة التالية" : "Next Page"}
            >
              {isArabic ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
            </Button>
          </div>

          <div className="mx-0.5 h-4 w-px bg-border/80" />

          {/* Zoom Controls */}
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleZoomOut}
              disabled={zoomRatio <= MIN_ZOOM || isRenderingPage}
              className="size-9 rounded-xl text-foreground disabled:opacity-35"
              title={isArabic ? "تصغير" : "Zoom Out"}
              aria-label={isArabic ? "تصغير" : "Zoom Out"}
            >
              <Minus className="size-4" />
            </Button>

            <span className="w-11 text-center text-xs font-bold tabular-nums text-foreground">
              {zoomPercentage}%
            </span>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleZoomIn}
              disabled={zoomRatio >= MAX_ZOOM || isRenderingPage}
              className="size-9 rounded-xl text-foreground disabled:opacity-35"
              title={isArabic ? "تكبير" : "Zoom In"}
              aria-label={isArabic ? "تكبير" : "Zoom In"}
            >
              <Plus className="size-4" />
            </Button>

            <Button
              type="button"
              variant={zoomRatio === 1.0 ? "secondary" : "ghost"}
              size="icon"
              onClick={handleFitWidth}
              disabled={isRenderingPage}
              className="size-9 rounded-xl text-foreground"
              title={isArabic ? "ملاءمة العرض" : "Fit Width"}
              aria-label={isArabic ? "ملاءمة العرض" : "Fit Width"}
            >
              <Maximize2 className="size-4" />
            </Button>
          </div>
        </div>
      </footer>
    </div>
  )
}
