"use client"

import { useI18n } from "@/lib/i18n"
import { Download, FileText, ArrowLeft, ArrowRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { buttonVariants, Button } from "@/components/ui/button"
import { formatInitialDocumentFileSize } from "@/lib/initial-documents/config"
import { cn } from "@/lib/utils"

export function OpenPdfFallbackCard({
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

        <h1 className="mt-4 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {isArabic ? "يتعذر فتح ملف PDF" : "Unable to Open PDF"}
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          {isArabic
            ? "لا يمكن عرض هذا الملف مباشرة على هذا الجهاز."
            : "This file cannot be displayed directly on this device."}
        </p>

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
  )
}
