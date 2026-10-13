"use client"

import { useEffect, useState } from "react"
import { useI18n } from "@/lib/i18n"
import { Download, FileText, ArrowLeft, ArrowRight, Loader2, Share2, AlertCircle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { buttonVariants, Button } from "@/components/ui/button"
import { formatInitialDocumentFileSize } from "@/lib/initial-documents/config"
import { cn } from "@/lib/utils"

type PreparationStatus = "loading" | "ready" | "unsupported" | "error"

export function OpenPdfView({
  documentId,
  fileName,
  fileSize,
  fallbackHref,
}: {
  documentId: string
  fileName: string
  fileSize: number
  fallbackHref: string
}) {
  const { locale } = useI18n()
  const isArabic = locale === "ar"

  const [status, setStatus] = useState<PreparationStatus>("loading")
  const [preparedFile, setPreparedFile] = useState<File | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const abortController = new AbortController()

    async function prepareFile() {
      try {
        setStatus("loading")
        setShareError(null)

        const response = await fetch(`/api/initial-documents?id=${encodeURIComponent(documentId)}`, {
          signal: abortController.signal,
        })

        if (!response.ok) {
          throw new Error(`Failed to load PDF (${response.status})`)
        }

        const blob = await response.blob()
        if (cancelled) return

        const file = new File([blob], fileName, { type: "application/pdf" })

        // Check file-sharing capability with the prepared File object
        const canShare = Boolean(
          typeof navigator !== "undefined" &&
          typeof navigator.share === "function" &&
          typeof navigator.canShare === "function" &&
          navigator.canShare({ files: [file] })
        )

        if (cancelled) return

        setPreparedFile(file)
        if (canShare) {
          setStatus("ready")
        } else {
          setStatus("unsupported")
        }
      } catch (err: unknown) {
        if (cancelled || (err instanceof Error && err.name === "AbortError")) {
          return
        }
        setStatus("error")
      }
    }

    void prepareFile()

    return () => {
      cancelled = true
      abortController.abort()
    }
  }, [documentId, fileName])

  const handleSharePdf = async () => {
    if (!preparedFile) return
    setShareError(null)

    try {
      await navigator.share({
        files: [preparedFile],
        title: fileName,
      })
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled native share sheet: handle silently
        return
      }
      setShareError(
        isArabic
          ? "تعذر مشاركة هذا الملف."
          : "Unable to share this PDF."
      )
    }
  }

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back()
    } else {
      window.location.href = fallbackHref
    }
  }

  return (
    <Card className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-sm sm:max-w-md sm:p-8">
      <CardContent className="flex flex-col items-center p-0">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-primary">
          <FileText className="size-7" />
        </div>

        {status === "unsupported" ? (
          <>
            <h1 className="mt-4 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {isArabic ? "يتعذر مشاركة ملف PDF" : "Unable to Share PDF"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {isArabic
                ? "لا يدعم هذا المتصفح مشاركة هذا الملف مع تطبيق آخر."
                : "This browser cannot share this PDF with another app."}
            </p>
          </>
        ) : status === "error" ? (
          <>
            <h1 className="mt-4 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {isArabic ? "تعذر تجهيز ملف PDF" : "Unable to Prepare PDF"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {isArabic
                ? "فشل تنزيل المستند لتجهيزه للمشاركة."
                : "Failed to download the document for sharing."}
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {isArabic ? "مشاركة ملف PDF" : "Share PDF"}
            </h1>
            {status === "loading" ? (
              <p className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {isArabic ? "جارٍ تجهيز ملف PDF..." : "Preparing PDF..."}
              </p>
            ) : null}
          </>
        )}

        <div className="mt-5 w-full rounded-xl border bg-muted/30 p-3 text-start">
          <p className="truncate text-xs font-semibold text-foreground" title={fileName}>
            {fileName}
          </p>
          {fileSize > 0 ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {formatInitialDocumentFileSize(fileSize)}
            </p>
          ) : null}
        </div>

        {shareError ? (
          <div
            role="alert"
            className="mt-4 flex w-full items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/8 p-3 text-start text-xs text-destructive"
          >
            <AlertCircle className="size-4 shrink-0" />
            <span>{shareError}</span>
          </div>
        ) : null}

        <div className="mt-6 flex w-full flex-col gap-2.5">
          {status === "ready" ? (
            <Button
              type="button"
              size="lg"
              onClick={handleSharePdf}
              className="w-full gap-2 rounded-xl font-medium"
            >
              <Share2 className="size-4" />
              {isArabic ? "مشاركة ملف PDF" : "Share PDF"}
            </Button>
          ) : status === "loading" ? (
            <Button
              type="button"
              size="lg"
              disabled
              className="w-full gap-2 rounded-xl font-medium"
            >
              <Loader2 className="size-4 animate-spin" />
              {isArabic ? "جارٍ التجهيز..." : "Preparing..."}
            </Button>
          ) : null}

          <a
            href={`/api/initial-documents?id=${encodeURIComponent(documentId)}&download=1`}
            className={cn(
              buttonVariants({
                variant: status === "ready" ? "outline" : "default",
                size: "lg",
              }),
              "w-full gap-2 rounded-xl font-medium"
            )}
          >
            <Download className="size-4" />
            {isArabic ? "تنزيل ملف PDF" : "Download PDF"}
          </a>

          <Button
            type="button"
            variant="ghost"
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
  )
}
