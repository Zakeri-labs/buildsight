"use client"

import Link from "next/link"
import { forwardRef, useEffect, useState, type ReactNode } from "react"
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Download,
  FileText,
  Hourglass,
  ImageIcon,
  Languages,
  Loader2,
  ShieldCheck,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SourcePdfViewer } from "@/components/stages/source-pdf-viewer"
import { CcRecipientsReadOnly } from "@/components/reports/cc-recipients-read-only"
import { extractSourcePdf } from "@/lib/stage-translations/client-source-pdf"
import type { ExtractedPdfImage, SourceImageSectionHint } from "@/lib/stage-translations/pdf-templates"
import { getSourcePdfAttachment } from "@/lib/stage-translations/source-document"
import { enqueueStageTranslationJob } from "@/lib/stage-translations/client-auto-generation"
import type {
  StageTranslationPageData,
  StageTranslationRecord,
  TranslationReportContent,
  TranslationSectionKey,
} from "@/lib/stage-translations/types"
import { statusLabel, statusTone } from "@/lib/stages/execution"
import type { ReportCcRecipient } from "@/lib/report-cc/types"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const SECTION_LABELS: Array<{ key: TranslationSectionKey; en: string; ar: string }> = [
  { key: "observation", en: "Observation / Work Progress", ar: "المعاينة وسير العمل" },
  { key: "recommendations", en: "Instructions / Recommendations", ar: "التوصيات والتعليمات" },
]

const COPY = {
  en: {
    back: "Back to inspection report",
    eyebrow: "AI Document Translation",
    title: "Construction Document Translation",
    subtitle: "Review the original English inspection document and its professional Arabic translation side by side.",
    processingTitle: "Preparing Translation",
    processingTranslation: "Translating report content…",
    processingDocuments: "Preparing translated documents…",
    processingHint: "Translation and PDF generation are in progress. This may take a few moments.",
    failedTitle: "Translation could not be completed.",
    failedHint: "The submitted Report is safe. Retry preparation for this same Report.",
    retry: "Retry",
    downloadOriginal: "EN",
    downloadArabic: "AR",
    downloadBilingual: "EN / AR",
    original: "English Original Document",
    sourcePdf: "Original Uploaded PDF",
    arabic: "Arabic Translation",
    projectInformation: "Project Information",
    reportDetails: "Report Information",
    inspectionContent: "Inspection Content",
    attachmentsGroup: "Attachments",
    project: "Project Name",
    projectReference: "Project Reference",
    stage: "Stage",
    term: "Term Name",
    document: "Document",
    reportTitle: "Report Title",
    documentNumber: "Report Number",
    visitNumber: "Visit Number",
    date: "Date",
    status: "Status",
    subject: "Subject",
    type: "Type",
    checklist: "Inspection Checklist",
    approvals: "Approval Information",
    evidence: "Images",
    attachments: "Related Documents",
    translatedAttachments: "Original Document Content",
    sourceVisuals: "Original Document Images",
    noContent: "No content recorded.",
    noApprovals: "No approval decisions recorded.",
    noAttachments: "No related attachments.",
    checked: "Completed",
    unchecked: "Open",
    pdfError: "Unable to generate or store the PDF.",
    stale: "The original inspection report changed after this translation was generated. Regenerate the translation before exporting Arabic or bilingual PDFs.",
  },
  ar: {
    back: "العودة إلى تقرير التفتيش",
    eyebrow: "ترجمة المستند بالذكاء الاصطناعي",
    title: "ترجمة مستندات الإنشاء",
    subtitle: "مراجعة مستند التفتيش الإنجليزي الأصلي وترجمته العربية المهنية جنباً إلى جنب.",
    processingTitle: "جارٍ إعداد الترجمة",
    processingTranslation: "جارٍ ترجمة محتوى التقرير…",
    processingDocuments: "جارٍ إعداد المستندات المترجمة…",
    processingHint: "الترجمة وإنشاء ملفات PDF قيد التنفيذ وقد يستغرق ذلك بضع لحظات.",
    failedTitle: "تعذر إكمال الترجمة.",
    failedHint: "تم حفظ التقرير بنجاح. يمكنك إعادة محاولة إعداد الترجمة لنفس التقرير.",
    retry: "إعادة المحاولة",
    downloadOriginal: "EN",
    downloadArabic: "AR",
    downloadBilingual: "EN / AR",
    original: "المستند الإنجليزي الأصلي",
    sourcePdf: "ملف PDF الإنجليزي الأصلي",
    arabic: "الترجمة العربية",
    projectInformation: "معلومات المشروع",
    reportDetails: "معلومات التقرير",
    inspectionContent: "محتوى التفتيش",
    attachmentsGroup: "المرفقات والصور",
    project: "اسم المشروع",
    projectReference: "مرجع المشروع",
    stage: "المرحلة",
    term: "اسم البند",
    document: "المستند",
    reportTitle: "عنوان التقرير",
    documentNumber: "رقم التقرير",
    visitNumber: "رقم الزيارة",
    date: "التاريخ",
    status: "الحالة",
    subject: "الموضوع",
    type: "النوع",
    checklist: "قائمة فحص التفتيش",
    approvals: "معلومات الاعتماد",
    evidence: "الصور",
    attachments: "المستندات المرتبطة",
    translatedAttachments: "محتوى المرفقات المترجم",
    sourceVisuals: "صور المستند الأصلي",
    noContent: "لا يوجد محتوى مسجل.",
    noApprovals: "لا توجد قرارات اعتماد مسجلة.",
    noAttachments: "لا توجد مرفقات مرتبطة.",
    checked: "مكتمل",
    unchecked: "مفتوح",
    pdfError: "تعذر إنشاء ملف PDF أو حفظه.",
    stale: "تم تعديل تقرير التفتيش الأصلي بعد إنشاء هذه الترجمة. أعد إنشاء الترجمة قبل تصدير ملف PDF العربي أو ثنائي اللغة.",
  },
} as const

type TranslationRecordState = StageTranslationRecord | null

type ReportLabels = {
  projectInformation: string
  reportDetails: string
  inspectionContent: string
  attachmentsGroup: string
  project: string
  projectReference: string
  stage: string
  term: string
  documentNumber: string
  visitNumber: string
  date: string
  status: string
  subject: string
  type: string
  checklist: string
  approvals: string
  evidence: string
  attachments: string
  translatedAttachments: string
  sourceVisuals: string
  noContent: string
  noApprovals: string
  noAttachments: string
  checked: string
  unchecked: string
}

function formatDate(value: string, language: "en" | "ar", includeTime = false) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  const year = date.getUTCFullYear()
  const monthNamesEn = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
  const monthNamesAr = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]
  const month = (language === "ar" ? monthNamesAr : monthNamesEn)[date.getUTCMonth()]
  const day = String(date.getUTCDate()).padStart(2, "0")

  if (!includeTime) {
    return `${day} ${month} ${year}`
  }

  const hours = String(date.getUTCHours()).padStart(2, "0")
  const minutes = String(date.getUTCMinutes()).padStart(2, "0")
  return `${day} ${month} ${year} ${hours}:${minutes}`
}

function filenameWithoutExtension(value: string) {
  return value.replace(/\.[^.]+$/, "")
}

export function StageTranslationViewer({
  data,
  ccRecipients,
  appendTranslatedPdfClosing = false,
  memberMobileView = false,
}: {
  data: StageTranslationPageData
  ccRecipients: ReportCcRecipient[]
  appendTranslatedPdfClosing?: boolean
  memberMobileView?: boolean
}) {
  const { locale } = useI18n()
  const copy = COPY[locale]
  const [translation, setTranslation] = useState<TranslationRecordState>(data.translation)
  const [busy, setBusy] = useState<"original" | "arabic" | "bilingual" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mobileLanguage, setMobileLanguage] = useState<"en" | "ar">("en")
  const labelsEn = COPY.en
  const labelsAr = COPY.ar
  const translated = translation?.translatedContent ?? null
  const original = data.response.content
  const sourcePdf = getSourcePdfAttachment(data)
  const isDirectStage = !data.term?.id || data.term.id === data.stage.id
  const translationIsStale = Boolean(
    translation?.generatedAt && new Date(data.response.updatedAt).getTime() > new Date(translation.generatedAt).getTime(),
  )

  const allGeneratedPdfsReady = Boolean(
    translation?.originalPdfPath && translation?.bilingualPdfPath,
  )
  const generationComplete = Boolean(
    translation?.status === "completed" && translation?.translatedContent && allGeneratedPdfsReady && !translationIsStale,
  )
  const generationFailed = translation?.status === "failed"

  const isSubmittedReport = data.response.status !== "draft" && data.response.status !== "in_progress"

  useEffect(() => {
    if (!isDirectStage || !isSubmittedReport || generationComplete || generationFailed) return
    enqueueStageTranslationJob({
      projectId: data.project.id,
      stageId: data.stage.id,
      responseId: data.response.id,
    })
  }, [data.project.id, data.stage.id, data.response.id, isDirectStage, isSubmittedReport, generationComplete, generationFailed])

  useEffect(() => {
    if (!isDirectStage || !isSubmittedReport || generationComplete || generationFailed) return
    let cancelled = false
    let timer: number | null = null

    const refreshStatus = async () => {
      try {
        const params = new URLSearchParams({
          projectId: data.project.id,
          stageId: data.stage.id,
          responseId: data.response.id,
          statusOnly: "1",
        })
        const response = await fetch(`/api/stage-translations?${params.toString()}`, { cache: "no-store" })
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.error || "Unable to refresh translation status.")
        if (!cancelled) {
          setTranslation(payload?.data?.translation ?? null)
          setError(null)
        }
      } catch (statusError) {
        if (!cancelled) setError(statusError instanceof Error ? statusError.message : "Unable to refresh translation status.")
      } finally {
        if (!cancelled) timer = window.setTimeout(refreshStatus, 4_000)
      }
    }

    timer = window.setTimeout(refreshStatus, 1_000)
    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [data.project.id, data.stage.id, data.response.id, isDirectStage, generationComplete, generationFailed])

  function retryGeneration() {
    setError(null)
    setTranslation((current) => current ? { ...current, status: "pending" } : current)
    enqueueStageTranslationJob({
      projectId: data.project.id,
      stageId: data.stage.id,
      responseId: data.response.id,
      retry: true,
    })
  }

  async function downloadPdf(kind: "original" | "arabic" | "bilingual") {
    if (!translation?.id) return
    const storagePath = kind === "original"
      ? translation.originalPdfPath
      : kind === "arabic"
        ? translation.arabicPdfPath
        : translation.bilingualPdfPath
    if (!storagePath) {
      setError(copy.pdfError)
      return
    }
    setBusy(kind)
    setError(null)
    try {
      const params = new URLSearchParams({ projectId: data.project.id, translationId: translation.id, kind })
      window.location.assign(`/api/stage-translations/pdf?${params.toString()}`)
    } finally {
      window.setTimeout(() => setBusy(null), 500)
    }
  }

  const backHref = isDirectStage
    ? `/projects/${data.project.id}/stages/${data.stage.id}/reports/${data.response.id}`
    : `/projects/${data.project.id}/stages/${data.stage.id}/terms/${data.term.id}/reports/${data.response.id}`
  const reportToRecipients = ccRecipients.slice(0, 1)
  const ccToRecipients = ccRecipients.slice(1)

  function selectMobileLanguage(language: "en" | "ar") {
    setMobileLanguage(language)
    requestAnimationFrame(() => {
      document.getElementById("mobile-translation-document-start")?.scrollIntoView({ block: "start" })
    })
  }

  if (isDirectStage && !generationComplete) {
    const preparingDocuments = Boolean(translation?.status === "completed" && translation.translatedContent)
    return (
      <div className={cn("mx-auto flex w-full max-w-[980px] flex-col gap-4", memberMobileView && "max-md:gap-3")}>
        <Link href={backHref} className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4 flip-rtl" />{copy.back}
        </Link>
        <Card className="overflow-hidden py-0">
          <CardContent className={cn("p-6 sm:p-8", memberMobileView && "max-md:p-4")}>
            <div className="flex items-start gap-4">
              <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", generationFailed ? "bg-red-50 text-red-600" : "bg-primary/10 text-primary")}>
                {generationFailed ? <AlertCircle className="size-5" /> : <Loader2 className="size-5 animate-spin" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h1 className={cn("text-xl font-semibold tracking-tight", memberMobileView && "max-md:text-lg")}>
                      {generationFailed ? copy.failedTitle : copy.processingTitle}
                    </h1>
                    <p className="mt-1 text-xs font-medium text-muted-foreground">{data.project.name} · {data.stage.name}</p>
                  </div>
                  <Badge variant="outline" className={statusTone(data.response.status as any)}>{statusLabel(data.response.status as any, locale)}</Badge>
                </div>

                {generationFailed ? (
                  <>
                    <p className="mt-4 text-sm leading-6 text-muted-foreground">{copy.failedHint}</p>
                    <Button className="mt-4" onClick={retryGeneration}>
                      <Loader2 className="hidden size-4" />{copy.retry}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-primary/10">
                      <div className="h-full w-2/5 animate-pulse rounded-full bg-primary" />
                    </div>
                    <p className="mt-3 text-sm font-medium">{preparingDocuments ? copy.processingDocuments : copy.processingTranslation}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.processingHint}</p>
                    {error ? <p role="alert" className="mt-3 text-xs text-amber-700">{error}</p> : null}
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className={cn("mx-auto flex w-full max-w-[1600px] flex-col gap-5", memberMobileView && "max-md:gap-3")}>
      <Link href={backHref} className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 flip-rtl" />{copy.back}
      </Link>

      {memberMobileView ? (
        <Card className="overflow-hidden py-0 md:hidden">
          <CardContent className="space-y-3 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                  <Languages className="size-3.5" />{copy.eyebrow}
                </div>
                <h1 className="text-lg font-semibold leading-tight tracking-tight">{copy.title}</h1>
              </div>
              <Badge variant="outline" className={cn("shrink-0 text-[10px]", statusTone(data.response.status as any))}>
                {statusLabel(data.response.status as any, locale)}
              </Badge>
            </div>

            <div className="min-w-0 space-y-1 text-sm">
              <p className="font-semibold text-foreground">{data.project.name}</p>
              <p className="break-words text-xs font-medium text-muted-foreground">{data.stage.name}</p>
              <p className="break-words text-xs text-muted-foreground">{data.response.reportTitle}</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>{locale === "ar" ? "الزيارة" : "Visit"} {String(data.response.visitNumber || 0).padStart(3, "0")}</span>
                <span aria-hidden="true">•</span>
                <span>{formatDate(data.response.createdAt, locale)}</span>
              </div>
              <p className="break-all text-xs font-medium text-foreground">{data.response.reportNumber}</p>
            </div>

          </CardContent>
        </Card>
      ) : null}

      <Card className={cn("overflow-hidden py-0", memberMobileView && "hidden md:flex")}>
        <div className="border-b bg-card px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary"><Languages className="size-4" />{copy.eyebrow}</div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{copy.title}</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{copy.subtitle}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline">{data.project.name}</Badge>
                <Badge variant="outline">{data.stage.name}</Badge>
                {!isDirectStage ? <Badge variant="outline">{data.term.name}</Badge> : null}
                <Badge variant="outline" className={statusTone(data.response.status as any)}>{statusLabel(data.response.status as any, locale)}</Badge>
              </div>
            </div>
            <div className="flex max-w-full flex-wrap gap-2 xl:max-w-[650px] xl:justify-end">
              <Button variant="outline" onClick={() => void downloadPdf("original")} disabled={busy !== null}>
                {busy === "original" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}{copy.downloadOriginal}
              </Button>
              <Button variant="outline" onClick={() => void downloadPdf("arabic")} disabled={busy !== null}>
                {busy === "arabic" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}{copy.downloadArabic}
              </Button>
              <Button variant="outline" onClick={() => void downloadPdf("bilingual")} disabled={busy !== null}>
                {busy === "bilingual" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}{copy.downloadBilingual}
              </Button>
            </div>
          </div>
        </div>
        <CardContent className={cn("grid gap-px bg-border p-0 sm:grid-cols-2", isDirectStage ? "lg:grid-cols-5" : "lg:grid-cols-3 xl:grid-cols-6")}>
          <HeaderMeta label={copy.project} value={data.project.name} />
          <HeaderMeta label={copy.stage} value={data.stage.name} />
          {!isDirectStage ? <HeaderMeta label={copy.term} value={data.term.name} /> : null}
          <HeaderMeta label={copy.documentNumber} value={data.response.reportNumber} />
          <HeaderMeta label={copy.document} value={data.response.reportTitle} />
          <HeaderMeta label={copy.date} value={formatDate(data.response.createdAt, locale)} />
        </CardContent>
      </Card>

      {memberMobileView ? (
        <details className="group overflow-hidden rounded-xl border bg-card md:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <span>{locale === "ar" ? "المستلمون" : "Recipients"} ({ccRecipients.length})</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t px-3.5 py-3">
            <div className="space-y-3">
              <MobileRecipientGroup
                label={locale === "ar" ? "إلى" : "TO"}
                recipients={reportToRecipients}
                empty={locale === "ar" ? "لم يتم تحديد مستلم رئيسي." : "No primary recipient selected."}
              />
              <MobileRecipientGroup
                label={locale === "ar" ? "نسخة" : "CC"}
                recipients={ccToRecipients}
                empty={locale === "ar" ? "لا توجد نسخ إضافية." : "No CC recipients selected."}
              />
            </div>
          </div>
        </details>
      ) : null}

      <div className={memberMobileView ? "hidden md:block" : undefined}>
        <CcRecipientsReadOnly recipients={ccRecipients} title="CC To" compact />
      </div>

      {error ? <div role="alert" className={cn("flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200", memberMobileView && "max-md:px-3 max-md:py-2.5 max-md:text-xs")}><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</div> : null}
      {translationIsStale ? <div role="status" className={cn("flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200", memberMobileView && "max-md:px-3 max-md:py-2.5 max-md:text-xs")}><AlertCircle className="mt-0.5 size-4 shrink-0" />{copy.stale}</div> : null}

      {memberMobileView ? (
        <div
          className="sticky top-12 z-30 -mx-1 border-y bg-background/95 px-1 py-2 backdrop-blur md:hidden"
        >
          <div className="grid grid-cols-2 rounded-xl bg-muted p-1" role="tablist" aria-label="Document language">
            <button
              type="button"
              role="tab"
              aria-selected={mobileLanguage === "en"}
              onClick={() => selectMobileLanguage("en")}
              className={cn(
                "h-8 rounded-lg px-3 text-xs font-semibold transition-colors",
                mobileLanguage === "en" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              English
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobileLanguage === "ar"}
              onClick={() => selectMobileLanguage("ar")}
              className={cn(
                "h-8 rounded-lg px-3 font-arabic text-xs font-semibold transition-colors",
                mobileLanguage === "ar" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              العربية
            </button>
          </div>
        </div>
      ) : null}

      {memberMobileView ? <div id="mobile-translation-document-start" className="scroll-mt-24 md:hidden" aria-hidden="true" /> : null}

      {translated ? (
        <MirroredBilingualReport
          data={data}
          english={original}
          arabic={translated}
          labelsEn={labelsEn}
          labelsAr={labelsAr}
          englishTitle={copy.original}
          arabicTitle={copy.arabic}
          generatedAt={translation?.generatedAt ?? null}
          sourcePdf={sourcePdf}
          sourcePdfTitle={copy.sourcePdf}
          mobileLanguage={memberMobileView ? mobileLanguage : undefined}
        />
      ) : null}


    </div>
  )
}

function MobileRecipientGroup({
  label,
  recipients,
  empty,
}: {
  label: string
  recipients: ReportCcRecipient[]
  empty: string
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      {recipients.length ? (
        <div className="space-y-1.5">
          {recipients.map((recipient) => {
            const details = [recipient.role, recipient.company].map((value) => value?.trim()).filter(Boolean).join(" · ")
            return (
              <div key={recipient.id} className="rounded-lg border bg-muted/10 px-2.5 py-2">
                <p className="truncate text-xs font-semibold">{recipient.name}</p>
                {details ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{details}</p> : null}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">{empty}</p>
      )}
    </div>
  )
}

function HeaderMeta({ label, value }: { label: string; value: string }) {
  return <div className="min-h-20 bg-card px-4 py-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 line-clamp-2 text-sm font-semibold">{value || "—"}</p></div>
}

function MirroredBilingualReport({
  data,
  english,
  arabic,
  labelsEn,
  labelsAr,
  englishTitle,
  arabicTitle,
  generatedAt,
  sourcePdf,
  sourcePdfTitle,
  mobileLanguage,
}: {
  data: StageTranslationPageData
  english: TranslationReportContent
  arabic: TranslationReportContent
  labelsEn: ReportLabels
  labelsAr: ReportLabels
  englishTitle: string
  arabicTitle: string
  generatedAt: string | null
  sourcePdf: StageTranslationPageData["response"]["attachments"][number] | null
  sourcePdfTitle: string
  mobileLanguage?: "en" | "ar"
}) {
  const evidence = data.response.attachments.filter((item) => item.attachmentKind === "evidence_image" || item.attachmentKind === "inline_image")
  const documents = data.response.attachments.filter((item) => item.attachmentKind === "document")
  const sourceDocument = useSourcePdfViewerDocument(data, sourcePdf)
  const sourceImages = sourceDocument.images
  const englishDocument = sourcePdf && sourceDocument.contentHtml
    ? {
        ...english,
        attachmentTranslations: [
          ...english.attachmentTranslations.filter((item) => item.attachmentId !== sourcePdf.id),
          {
            attachmentId: sourcePdf.id,
            filename: sourcePdf.originalFilename,
            contentHtml: sourceDocument.contentHtml,
          },
        ],
      }
    : english

  return (
    <section className="stage-translation-report min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 text-slate-800 shadow-sm">
      <div className="h-2 bg-blue-700" />
      <div className="space-y-4 p-4 sm:p-5">
        <MirroredRow
          mobileLanguage={mobileLanguage}
          english={<ReportHeaderCell language="en" title={englishTitle} data={data} content={englishDocument} generatedAt={generatedAt} />}
          arabic={<ReportHeaderCell language="ar" title={arabicTitle} data={data} content={arabic} generatedAt={generatedAt} />}
        />

        <MirroredRow
          mobileLanguage={mobileLanguage}
          english={
            <MirroredSectionCard title={labelsEn.projectInformation} icon={<FileText className="size-4" />}>
              <ProjectInformationBody data={data} content={englishDocument} labels={labelsEn} language="en" mobileCompact={Boolean(mobileLanguage)} />
            </MirroredSectionCard>
          }
          arabic={
            <MirroredSectionCard title={labelsAr.projectInformation} icon={<FileText className="size-4" />}>
              <ProjectInformationBody data={data} content={arabic} labels={labelsAr} language="ar" mobileCompact={Boolean(mobileLanguage)} />
            </MirroredSectionCard>
          }
        />

        <MirroredRow
          mobileLanguage={mobileLanguage}
          english={
            <MirroredSectionCard title={labelsEn.reportDetails} icon={<ClipboardCheck className="size-4" />}>
              <ReportDetailsBody content={englishDocument} labels={labelsEn} mobileCompact={Boolean(mobileLanguage)} />
            </MirroredSectionCard>
          }
          arabic={
            <MirroredSectionCard title={labelsAr.reportDetails} icon={<ClipboardCheck className="size-4" />}>
              <ReportDetailsBody content={arabic} labels={labelsAr} mobileCompact={Boolean(mobileLanguage)} />
            </MirroredSectionCard>
          }
        />

        {SECTION_LABELS.filter((section) => {
          const hasEn = Boolean(englishDocument.sections[section.key]?.trim())
          const hasAr = Boolean(arabic.sections[section.key]?.trim())
          const hasImg = sourceImages.some((image) => image.sectionHint === section.key)
          return hasEn || hasAr || hasImg
        }).map((section) => (
          <MirroredRow
            key={section.key}
            mobileLanguage={mobileLanguage}
            english={
              <MirroredSectionCard title={section.en} icon={<ClipboardCheck className="size-4" />}>
                <RichHtml html={englishDocument.sections[section.key]} empty={labelsEn.noContent} />
                <SourcePdfImageGrid
                  images={sourceImages.filter((image) => image.sectionHint === section.key)}
                  content={englishDocument}
                  language="en"
                />
              </MirroredSectionCard>
            }
            arabic={
              <MirroredSectionCard title={section.ar} icon={<ClipboardCheck className="size-4" />}>
                <RichHtml html={arabic.sections[section.key]} empty={labelsAr.noContent} />
                <SourcePdfImageGrid
                  images={sourceImages.filter((image) => image.sectionHint === section.key)}
                  content={arabic}
                  language="ar"
                />
              </MirroredSectionCard>
            }
          />
        ))}

        {englishDocument.checklist.length > 0 || arabic.checklist.length > 0 || sourceImages.some((i) => i.sectionHint === "checklist") ? (
          <MirroredRow
            mobileLanguage={mobileLanguage}
            english={
              <MirroredSectionCard title={labelsEn.checklist} icon={<CheckCircle2 className="size-4" />}>
                <ChecklistBody content={englishDocument} labels={labelsEn} language="en" mobileCompact={Boolean(mobileLanguage)} />
                <SourcePdfImageGrid
                  images={sourceImages.filter((image) => image.sectionHint === "checklist")}
                  content={englishDocument}
                  language="en"
                />
              </MirroredSectionCard>
            }
            arabic={
              <MirroredSectionCard title={labelsAr.checklist} icon={<CheckCircle2 className="size-4" />}>
                <ChecklistBody content={arabic} referenceContent={englishDocument} labels={labelsAr} language="ar" mobileCompact={Boolean(mobileLanguage)} />
                <SourcePdfImageGrid
                  images={sourceImages.filter((image) => image.sectionHint === "checklist")}
                  content={arabic}
                  language="ar"
                />
              </MirroredSectionCard>
            }
          />
        ) : null}

        {englishDocument.approvals.length > 0 || arabic.approvals.length > 0 || sourceImages.some((i) => i.sectionHint === "approvals") ? (
          <MirroredRow
            mobileLanguage={mobileLanguage}
            english={
              <MirroredSectionCard title={labelsEn.approvals} icon={<ShieldCheck className="size-4" />}>
                <ApprovalBody content={englishDocument} labels={{ ...labelsEn, noApprovals: labelsEn.noContent }} language="en" />
                <SourcePdfImageGrid
                  images={sourceImages.filter((image) => image.sectionHint === "approvals")}
                  content={englishDocument}
                  language="en"
                />
              </MirroredSectionCard>
            }
            arabic={
              <MirroredSectionCard title={labelsAr.approvals} icon={<ShieldCheck className="size-4" />}>
                <ApprovalBody content={arabic} labels={{ ...labelsAr, noApprovals: labelsAr.noContent }} language="ar" />
                <SourcePdfImageGrid
                  images={sourceImages.filter((image) => image.sectionHint === "approvals")}
                  content={arabic}
                  language="ar"
                />
              </MirroredSectionCard>
            }
          />
        ) : null}

        <MirroredRow
          mobileLanguage={mobileLanguage}
          english={
            <MirroredSectionCard title={labelsEn.attachmentsGroup} icon={<ImageIcon className="size-4" />}>
              <AttachmentsBody documents={documents} evidence={evidence} content={englishDocument} labels={labelsEn} language="en" />
              <SourcePdfImageGrid
                images={sourceImages.filter(isAttachmentSourceImage)}
                content={englishDocument}
                language="en"
                grouped
              />
            </MirroredSectionCard>
          }
          arabic={
            <MirroredSectionCard title={labelsAr.attachmentsGroup} icon={<ImageIcon className="size-4" />}>
              <AttachmentsBody documents={documents} evidence={evidence} content={arabic} labels={labelsAr} language="ar" />
              <SourcePdfImageGrid
                images={sourceImages.filter(isAttachmentSourceImage)}
                content={arabic}
                language="ar"
                grouped
              />
            </MirroredSectionCard>
          }
        />

        <MirroredRow
          mobileLanguage={mobileLanguage}
          english={<ReportFooter data={data} title={englishTitle} />}
          arabic={<ReportFooter data={data} title={arabicTitle} />}
        />

        {sourcePdf ? (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <div lang="en" dir="ltr" className={cn("min-w-0", mobileLanguage === "ar" && "max-md:hidden")}>
              <SourcePdfViewer data={data} attachment={sourcePdf} title={sourcePdfTitle} />
            </div>
            <div className="hidden lg:block" aria-hidden="true" />
          </div>
        ) : null}
      </div>
    </section>
  )
}

type ViewerSourceImage = ExtractedPdfImage & { fullPageFallback?: boolean }

function useSourcePdfViewerDocument(
  data: StageTranslationPageData,
  attachment: StageTranslationPageData["response"]["attachments"][number] | null,
) {
  const [documentState, setDocumentState] = useState<{
    images: ViewerSourceImage[]
    contentHtml: string
  }>({ images: [], contentHtml: "" })

  useEffect(() => {
    let active = true
    if (!attachment) {
      setDocumentState({ images: [], contentHtml: "" })
      return () => { active = false }
    }

    setDocumentState({ images: [], contentHtml: "" })
    void extractSourcePdf(data, attachment, {
      includePageImages: true,
      imageWidth: 1_000,
      imageMode: "visuals",
    })
      .then((document) => {
        if (!active) return
        const extracted: ViewerSourceImage[] = []
        const pageContent: string[] = []

        for (const page of document.pages) {
          if (page.textHtml.trim()) {
            pageContent.push(
              `<section data-source-pdf-page="${page.pageNumber}">` +
              `<h3>Page ${page.pageNumber}</h3>${page.textHtml}</section>`,
            )
          }
          extracted.push(...(page.images ?? []))

          // A rendered page is retained only when PDF.js could not decode every
          // embedded image. Keeping it here prevents inspection evidence from
          // disappearing while still preferring individually positioned images.
          if (page.imageDataUrl && (page.images?.length === 0 || page.imageExtractionComplete === false)) {
            extracted.push({
              id: `page-${page.pageNumber}-visual-fallback`,
              pageNumber: page.pageNumber,
              order: 10_000,
              dataUrl: page.imageDataUrl,
              sourceCaption: `Original PDF page ${page.pageNumber}`,
              contextText: "",
              sectionHint: "evidence",
              xRatio: 0,
              yRatio: 0,
              widthRatio: 1,
              heightRatio: 1,
              fullPageFallback: true,
            })
          }
        }

        extracted.sort((left, right) => left.pageNumber - right.pageNumber || left.order - right.order)
        setDocumentState({ images: extracted, contentHtml: pageContent.join("") })
      })
      .catch(() => {
        if (active) setDocumentState({ images: [], contentHtml: "" })
      })

    return () => { active = false }
  }, [attachment, data])

  return documentState
}

function isAttachmentSourceImage(image: ViewerSourceImage) {
  return !image.sectionHint || image.sectionHint === "evidence" || image.sectionHint === "documents"
}

function textLinesFromHtml(html: string) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|li|figcaption|caption|tr|td|th|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
}

function normalizedFigureNumber(value: string) {
  const arabicIndic = "٠١٢٣٤٥٦٧٨٩"
  const easternArabic = "۰۱۲۳۴۵۶۷۸۹"
  const normalized = value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabicIndex = arabicIndic.indexOf(digit)
    if (arabicIndex >= 0) return String(arabicIndex)
    return String(easternArabic.indexOf(digit))
  })
  return normalized.match(/\d+/)?.[0] ?? ""
}

function sectionHtmlForImage(content: TranslationReportContent, hint: SourceImageSectionHint | null) {
  if (hint && hint in content.sections) {
    return content.sections[hint as TranslationSectionKey]
  }
  return [
    ...Object.values(content.sections),
    ...content.attachmentTranslations.map((item) => item.contentHtml),
  ].join("\n")
}

function sourceImageCaption(
  image: ViewerSourceImage,
  content: TranslationReportContent,
  language: "en" | "ar",
) {
  if (language === "en") {
    return image.sourceCaption.trim() || `Source PDF page ${image.pageNumber} · Image ${image.order}`
  }

  const figureNumber = normalizedFigureNumber(image.sourceCaption)
  const lines = textLinesFromHtml(sectionHtmlForImage(content, image.sectionHint))
  const figurePattern = /^(?:الشكل|شكل|الصورة|صورة|اللقطة|لقطة)\b/i
  const translated = lines.find((line) => {
    if (!figurePattern.test(line)) return false
    return !figureNumber || normalizedFigureNumber(line) === figureNumber
  })

  if (translated) return translated
  if (image.fullPageFallback) return `معاينة الصفحة ${image.pageNumber} من ملف PDF الأصلي`
  return `صورة من الصفحة ${image.pageNumber} · رقم ${image.order}`
}

function SourcePdfImageGrid({
  images,
  content,
  language,
  grouped = false,
}: {
  images: ViewerSourceImage[]
  content: TranslationReportContent
  language: "en" | "ar"
  grouped?: boolean
}) {
  if (!images.length) return null

  return (
    <div className={cn("border-t border-slate-200 pt-4", grouped ? "mt-7" : "mt-5")}>
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
        {language === "ar" ? "صور من ملف PDF الأصلي" : "Images from original PDF"}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {images.map((image) => (
          <figure key={image.id} className="stage-translation-no-break overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            <div className="flex min-h-40 items-center justify-center bg-white p-2">
              <img
                src={image.dataUrl}
                alt={sourceImageCaption(image, content, language)}
                className="max-h-[420px] w-full object-contain"
              />
            </div>
            <figcaption className="border-t border-slate-200 px-3 py-2 text-xs leading-5 text-slate-600">
              {sourceImageCaption(image, content, language)}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

function MirroredRow({
  english,
  arabic,
  mobileLanguage,
}: {
  english: ReactNode
  arabic: ReactNode
  mobileLanguage?: "en" | "ar"
}) {
  return (
    <div className="grid items-stretch gap-4 lg:grid-cols-2">
      <div lang="en" dir="ltr" className={cn("h-full min-w-0", mobileLanguage === "ar" && "max-md:hidden")}>{english}</div>
      <div lang="ar" dir="rtl" className={cn("h-full min-w-0 font-arabic", mobileLanguage === "en" && "max-md:hidden")}>{arabic}</div>
    </div>
  )
}

function ReportHeaderCell({
  language,
  title,
  data,
  content,
  generatedAt,
}: {
  language: "en" | "ar"
  title: string
  data: StageTranslationPageData
  content: TranslationReportContent
  generatedAt: string | null
}) {
  const isArabic = language === "ar"
  const isDirectStage = !data.term?.id || data.term.id === data.stage.id
  return (
    <header className="stage-translation-no-break h-full rounded-2xl border border-slate-200 bg-white px-5 py-5 sm:px-7">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-blue-700"><Languages className="size-4" />{title}</div>
          <h2 className="break-words text-2xl font-bold tracking-tight text-slate-950">{content.reportTitle || data.response.reportTitle}</h2>
          <p className="mt-1 text-sm text-slate-600">{!isDirectStage ? (content.termName || data.term.name) : (content.stageName || data.stage.name)}</p>
        </div>
        <div className="shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">{isArabic ? "AR" : "EN"}</div>
      </div>
      {generatedAt ? <p className="mt-3 text-[11px] text-slate-500">{isArabic ? "تاريخ إنشاء الترجمة" : "Translation generated"}: {formatDate(generatedAt, language, true)}</p> : null}
    </header>
  )
}

function MirroredSectionCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="stage-translation-no-break h-full rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <SectionHeading icon={icon} title={title} />
      {children}
    </section>
  )
}

function ProjectInformationBody({
  data,
  content,
  labels,
  language,
  mobileCompact = false,
}: {
  data: StageTranslationPageData
  content: TranslationReportContent
  labels: ReportLabels
  language: "en" | "ar"
  mobileCompact?: boolean
}) {
  const authorName = data.response.createdBy?.name || "—"
  return (
    <dl className={cn("grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3", mobileCompact && "max-md:grid-cols-2 max-md:gap-2 max-md:text-xs")}>
      <ReportMeta label={labels.project} value={data.project.name} empty={labels.noContent} />
      {mobileCompact ? <ReportMeta className="md:hidden" label={labels.projectReference} value={data.project.code || "—"} empty={labels.noContent} /> : null}
      <ReportMeta label={labels.stage} value={content.stageName || data.stage.name} empty={labels.noContent} />
      <ReportMeta label={labels.visitNumber} value={String(data.response.visitNumber || "")} empty={labels.noContent} />
      <ReportMeta label={labels.documentNumber} value={data.response.reportNumber} empty={labels.noContent} />
      <ReportMeta label={labels.date} value={formatDate(data.response.createdAt, language)} empty={labels.noContent} />
      <ReportMeta label={language === "ar" ? "مقدم التقرير" : "Created By"} value={authorName} empty={labels.noContent} />
    </dl>
  )
}

function ReportDetailsBody({ content, labels, mobileCompact = false }: { content: TranslationReportContent; labels: ReportLabels; mobileCompact?: boolean }) {
  const hasSubject = Boolean(content.subject?.trim() && content.subject.trim() !== "—" && content.subject.trim() !== labels.noContent)
  return (
    <dl className={cn("grid gap-3 text-sm", hasSubject ? "sm:grid-cols-2" : "grid-cols-1", mobileCompact && "max-md:grid-cols-1 max-md:gap-2 max-md:text-xs")}>
      <ReportMeta label={labels.reportTitle} value={content.reportTitle} empty={labels.noContent} />
      {hasSubject ? <ReportMeta label={labels.subject} value={content.subject} empty={labels.noContent} /> : null}
    </dl>
  )
}

function AttachmentsBody({
  documents,
  evidence,
  content,
  labels,
  language,
}: {
  documents: StageTranslationPageData["response"]["attachments"]
  evidence: StageTranslationPageData["response"]["attachments"]
  content: TranslationReportContent
  labels: ReportLabels
  language: "en" | "ar"
}) {
  return (
    <div className="space-y-7">
      <EvidenceSection attachments={evidence} title={labels.evidence} empty={labels.noAttachments} />
      <DocumentsSection documents={documents} content={content} labels={labels} language={language} />
    </div>
  )
}

function ReportFooter({ data, title }: { data: StageTranslationPageData; title: string }) {
  return (
    <footer className="stage-translation-no-break h-full rounded-xl border border-slate-200 bg-white px-5 py-3 text-center text-[11px] text-slate-500 sm:px-7">
      {data.project.name} · {data.response.reportNumber} · {title}
    </footer>
  )
}

const LanguageReport = forwardRef<HTMLElement, {
  language: "en" | "ar"
  title: string
  data: StageTranslationPageData
  content: TranslationReportContent
  labels: ReportLabels
  generatedAt: string | null
  sourcePdf?: StageTranslationPageData["response"]["attachments"][number] | null
  mobileCompact?: boolean
}>(function LanguageReport({ language, title, data, content, labels, generatedAt, sourcePdf, mobileCompact = false }, ref) {
  const isArabic = language === "ar"
  const isDirectStage = !data.term?.id || data.term.id === data.stage.id
  const evidence = data.response.attachments.filter((item) => item.attachmentKind === "evidence_image" || item.attachmentKind === "inline_image")
  const documents = data.response.attachments.filter((item) => item.attachmentKind === "document")

  return (
    <article ref={ref} lang={language} dir={isArabic ? "rtl" : "ltr"} className={cn("stage-translation-report min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-sm", isArabic && "font-arabic")}>
      <div className="h-2 bg-blue-700" />
      <header className="stage-translation-no-break border-b border-slate-200 bg-slate-50 px-5 py-5 sm:px-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-blue-700"><Languages className="size-4" />{title}</div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-950">{content.reportTitle || data.response.reportTitle}</h2>
            <p className="mt-1 text-sm text-slate-600">{!isDirectStage ? (content.termName || data.term.name) : (content.stageName || data.stage.name)}</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">{isArabic ? "AR" : "EN"}</div>
        </div>
        {generatedAt ? <p className="mt-3 text-[11px] text-slate-500">{isArabic ? "تاريخ إنشاء الترجمة" : "Translation generated"}: {formatDate(generatedAt, language, true)}</p> : null}
      </header>

      <div className="space-y-8 px-5 py-6 sm:px-7 sm:py-8">
        <ReportGroup title={labels.projectInformation}>
          <dl className={cn("grid gap-3 text-sm sm:grid-cols-2", mobileCompact && "max-md:grid-cols-2 max-md:gap-2 max-md:text-xs")}>
            <ReportMeta label={labels.project} value={data.project.name} />
            <ReportMeta label={labels.projectReference} value={data.project.code || "—"} />
            <ReportMeta label={labels.stage} value={content.stageName || data.stage.name} />
            {!isDirectStage ? <ReportMeta label={labels.term} value={content.termName || data.term.name} /> : null}
            <ReportMeta label={labels.documentNumber} value={data.response.reportNumber} />
            <ReportMeta label={labels.visitNumber} value={String(data.response.visitNumber)} />
            <ReportMeta label={labels.date} value={formatDate(data.response.createdAt, language)} />
            <ReportMeta label={labels.status} value={statusLabel(data.response.status as any, language)} />
          </dl>
        </ReportGroup>

        <ReportGroup title={labels.reportDetails}>
          <dl className={cn("grid gap-3 text-sm sm:grid-cols-2", mobileCompact && "max-md:grid-cols-2 max-md:gap-2 max-md:text-xs")}>
            <ReportMeta label={labels.subject} value={content.subject || "—"} />
            <ReportMeta label={labels.type} value={content.reportType || "—"} />
          </dl>
        </ReportGroup>

        {SECTION_LABELS.some((section) => Boolean(content.sections[section.key]?.trim())) ? (
          <ReportGroup title={labels.inspectionContent}>
            <div className="space-y-7">
              {SECTION_LABELS.filter((section) => Boolean(content.sections[section.key]?.trim())).map((section) => (
                <ReportSection key={section.key} title={isArabic ? section.ar : section.en} html={content.sections[section.key]} empty={labels.noContent} />
              ))}
            </div>
          </ReportGroup>
        ) : null}

        {content.checklist.length > 0 ? <ChecklistSection content={content} labels={labels} language={language} mobileCompact={mobileCompact} /> : null}
        {content.approvals.length > 0 ? <ApprovalSection content={content} labels={labels} language={language} /> : null}

        <ReportGroup title={labels.attachmentsGroup}>
          <div className="space-y-7">
            <EvidenceSection attachments={evidence} title={labels.evidence} empty={labels.noAttachments} />
            <DocumentsSection documents={documents} content={content} labels={labels} language={language} />
            {isArabic && sourcePdf ? <SourceDocumentVisuals data={data} attachment={sourcePdf} title={labels.sourceVisuals} /> : null}
          </div>
        </ReportGroup>
      </div>

      <footer className="stage-translation-no-break border-t border-slate-200 bg-slate-50 px-5 py-3 text-center text-[11px] text-slate-500 sm:px-7">
        {data.project.name} · {data.response.reportNumber} · {title}
      </footer>
    </article>
  )
})


function SourceDocumentVisuals({
  data,
  attachment,
  title,
}: {
  data: StageTranslationPageData
  attachment: StageTranslationPageData["response"]["attachments"][number]
  title: string
}) {
  const [pages, setPages] = useState<Array<{ pageNumber: number; imageDataUrl: string }>>([])

  useEffect(() => {
    let active = true
    void extractSourcePdf(data, attachment, { includePageImages: true, imageWidth: 760, imageMode: "visuals" })
      .then((document) => {
        if (!active) return
        setPages(document.pages.flatMap((page) => page.imageDataUrl ? [{ pageNumber: page.pageNumber, imageDataUrl: page.imageDataUrl }] : []))
      })
      .catch(() => {
        if (active) setPages([])
      })
    return () => { active = false }
  }, [attachment, data])

  if (!pages.length) return null
  return (
    <section>
      <SectionHeading icon={<ImageIcon className="size-4" />} title={title} />
      <div className="grid gap-3 sm:grid-cols-2">
        {pages.map((page) => (
          <figure key={page.pageNumber} className="stage-translation-no-break overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            <img src={page.imageDataUrl} alt={`${attachment.originalFilename} page ${page.pageNumber}`} className="h-auto w-full" />
            <figcaption className="px-3 py-2 text-[11px] text-slate-600">{attachment.originalFilename} · {page.pageNumber}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}

function ReportGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="stage-translation-no-break rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
      <h3 className="mb-4 border-b border-slate-200 pb-3 text-lg font-bold text-slate-950">{title}</h3>
      {children}
    </section>
  )
}

function ReportMeta({ label, value, empty = "—", className }: { label: string; value?: string | null; empty?: string; className?: string }) {
  const displayValue = value?.trim() ? value : empty
  return <div className={cn("rounded-xl border border-slate-200 bg-white px-3.5 py-3", className)}><dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold text-slate-900">{displayValue}</dd></div>
}

function ReportSection({ title, html, empty }: { title: string; html: string; empty: string }) {
  return <section><SectionHeading icon={<ClipboardCheck className="size-4" />} title={title} /><RichHtml html={html} empty={empty} /></section>
}

function SectionHeading({ icon, title }: { icon: ReactNode; title: string }) {
  return <h3 className="stage-translation-no-break mb-3 flex items-center gap-2 border-b border-slate-200 pb-2 text-lg font-bold text-slate-950"><span className="text-blue-700">{icon}</span>{title}</h3>
}

function RichHtml({ html, empty }: { html: string; empty: string }) {
  if (!html.trim()) return <p className="text-sm italic text-slate-500">{empty}</p>
  return <div className="stage-translation-richtext text-[14px] leading-7 text-slate-700" dangerouslySetInnerHTML={{ __html: html }} />
}

function ChecklistSection({ content, labels, language, mobileCompact = false }: { content: TranslationReportContent; labels: ReportLabels; language: "en" | "ar"; mobileCompact?: boolean }) {
  return <section><SectionHeading icon={<CheckCircle2 className="size-4" />} title={labels.checklist} /><ChecklistBody content={content} labels={labels} language={language} mobileCompact={mobileCompact} /></section>
}

function ChecklistBody({
  content,
  referenceContent,
  labels,
  language,
  mobileCompact = false,
}: {
  content: TranslationReportContent
  referenceContent?: TranslationReportContent
  labels: ReportLabels
  language: "en" | "ar"
  mobileCompact?: boolean
}) {
  if (!content.checklist.length) return <p className="text-sm italic text-slate-500">{labels.noContent}</p>
  const refList = referenceContent?.checklist ?? content.checklist
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className={cn("w-full border-collapse text-sm", mobileCompact && "max-md:text-[11px]")}>
        <tbody>{content.checklist.map((item, index) => {
          const refItem = refList[index] ?? item
          const itemResult = item.result || refItem.result || (item.checked || refItem.checked ? "pass" : "pending")
          const isPassed = itemResult === "pass" || item.checked || refItem.checked
          const isFailed = itemResult === "fail"
          const isInProgress = itemResult === "in_progress"

          let badgeClasses = "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
          let icon = <X className="size-3.5 stroke-[2] opacity-40" />
          let titleTooltip = language === "ar" ? "غير مكتمل" : "Open"

          if (isPassed) {
            badgeClasses = "border-emerald-600 bg-emerald-600 text-white shadow-2xs dark:border-emerald-600 dark:bg-emerald-600"
            icon = <Check className="size-4 stroke-[3]" />
            titleTooltip = language === "ar" ? "مكتمل / مطابق" : "Passed"
          } else if (isFailed) {
            badgeClasses = "border-rose-600 bg-rose-600 text-white shadow-2xs dark:border-rose-600 dark:bg-rose-600"
            icon = <X className="size-4 stroke-[3]" />
            titleTooltip = language === "ar" ? "غير مطابق" : "Failed"
          } else if (isInProgress) {
            badgeClasses = "border-amber-500 bg-amber-500 text-white shadow-2xs dark:border-amber-500 dark:bg-amber-500"
            icon = <Hourglass className="size-3.5 stroke-[2.5]" />
            titleTooltip = language === "ar" ? "قيد التنفيذ" : "In Progress"
          }

          return (
            <tr key={item.id || `check-${index}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
              <td className={cn("w-12 bg-slate-50 px-3.5 py-3 text-center font-bold text-slate-500", mobileCompact && "max-md:w-9 max-md:px-1.5 max-md:py-2")}>{index + 1}</td>
              <td className={cn("px-4 py-3", mobileCompact && "max-md:px-2.5 max-md:py-2")}>
                <p className="font-semibold text-slate-900">{item.label}</p>
                {item.notes ? <p className={cn("mt-1 text-xs text-slate-500", mobileCompact && "max-md:text-[10px]")}>{item.notes}</p> : null}
              </td>
              <td className={cn("w-16 px-4 py-3 text-end", mobileCompact && "max-md:w-11 max-md:px-1.5 max-md:py-2")}>
                <span title={titleTooltip} className={cn("inline-flex size-7 items-center justify-center rounded-lg border", mobileCompact && "max-md:size-6 max-md:rounded-md", badgeClasses)}>
                  {icon}
                </span>
              </td>
            </tr>
          )
        })}</tbody>
      </table>
    </div>
  )
}

function ApprovalSection({ content, labels, language }: { content: TranslationReportContent; labels: ReportLabels; language: "en" | "ar" }) {
  return <section><SectionHeading icon={<ShieldCheck className="size-4" />} title={labels.approvals} /><ApprovalBody content={content} labels={labels} language={language} /></section>
}

function ApprovalBody({ content, labels, language }: { content: TranslationReportContent; labels: ReportLabels; language: "en" | "ar" }) {
  if (!content.approvals.length) return <p className="text-sm italic text-slate-500">{labels.noApprovals}</p>
  return <div className="space-y-3">{content.approvals.map((approval) => <div key={approval.id} className="stage-translation-no-break rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{approval.reviewerName}</p><p className="mt-0.5 text-xs text-slate-500">{formatDate(approval.decidedAt, language, true)}</p></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">{approval.decision}</span></div>{approval.comments ? <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">{approval.comments}</p> : null}</div>)}</div>
}

function EvidenceSection({ attachments, title, empty }: { attachments: StageTranslationPageData["response"]["attachments"]; title: string; empty: string }) {
  return <section><SectionHeading icon={<ImageIcon className="size-4" />} title={title} /><EvidenceGrid attachments={attachments} empty={empty} /></section>
}

function EvidenceGrid({ attachments, empty }: { attachments: StageTranslationPageData["response"]["attachments"]; empty: string }) {
  if (!attachments.length) return <p className="text-sm italic text-slate-500">{empty}</p>
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{attachments.map((attachment) => <figure key={attachment.id} className="stage-translation-no-break overflow-hidden rounded-xl border border-slate-200 bg-slate-50"><img src={`/api/stage-evidence?path=${encodeURIComponent(attachment.storagePath)}`} alt={attachment.originalFilename} className="aspect-[4/3] w-full object-cover" /><figcaption className="truncate px-3 py-2 text-[11px] text-slate-600">{attachment.originalFilename}</figcaption></figure>)}</div>
}

function DocumentsSection({ documents, content, labels, language }: { documents: StageTranslationPageData["response"]["attachments"]; content: TranslationReportContent; labels: ReportLabels; language: "en" | "ar" }) {
  return <section><SectionHeading icon={<FileText className="size-4" />} title={labels.attachments} /><DocumentList documents={documents} content={content} labels={labels} language={language} /></section>
}

function DocumentList({ documents, content, labels, language }: { documents: StageTranslationPageData["response"]["attachments"]; content: TranslationReportContent; labels: ReportLabels; language: "en" | "ar" }) {
  if (!documents.length) return <p className="text-sm italic text-slate-500">{labels.noAttachments}</p>
  return <div className="space-y-3">{documents.map((document) => {
    const translatedAttachment = content.attachmentTranslations.find((item) => item.attachmentId === document.id)
    return <div key={document.id} className="stage-translation-no-break rounded-xl border border-slate-200 p-3"><a href={`/api/stage-evidence?path=${encodeURIComponent(document.storagePath)}&download=1&filename=${encodeURIComponent(document.originalFilename)}`} className="flex items-center gap-3 font-semibold text-blue-700"><span className="flex size-9 items-center justify-center rounded-lg bg-blue-50"><FileText className="size-4" /></span><span className="min-w-0 flex-1 truncate">{document.originalFilename}</span><Download className="size-4" /></a>{translatedAttachment?.contentHtml ? <div className="mt-4"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{labels.translatedAttachments}: {filenameWithoutExtension(document.originalFilename)}</p><RichHtml html={translatedAttachment.contentHtml} empty={labels.noContent} /></div> : null}</div>
  })}</div>
}
