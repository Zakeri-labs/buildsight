"use client"

import Link from "next/link"
import { forwardRef, useState, type ReactNode } from "react"
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  ImageIcon,
  Languages,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SourcePdfViewer } from "@/components/stages/source-pdf-viewer"
import { exportTranslationPdf } from "@/lib/stage-translations/client-pdf"
import { getSourcePdfAttachment } from "@/lib/stage-translations/source-document"
import type {
  StageTranslationPageData,
  StageTranslationRecord,
  TranslationReportContent,
  TranslationSectionKey,
} from "@/lib/stage-translations/types"
import { statusLabel, statusTone } from "@/lib/stages/execution"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const SECTION_LABELS: Array<{ key: TranslationSectionKey; en: string; ar: string }> = [
  { key: "feedback", en: "Feedback", ar: "الملاحظات العامة" },
  { key: "observation", en: "Observation", ar: "المعاينة" },
  { key: "findings", en: "Findings", ar: "النتائج" },
  { key: "recommendations", en: "Recommendations", ar: "التوصيات" },
  { key: "correctiveActions", en: "Corrective Actions", ar: "الإجراءات التصحيحية" },
]

const COPY = {
  en: {
    back: "Back to inspection report",
    eyebrow: "AI Document Translation",
    title: "Construction Document Translation",
    subtitle: "Review the original English inspection document and its professional Arabic translation side by side.",
    generate: "Generate Translation",
    regenerate: "Regenerate Translation",
    generating: "Translating complete document...",
    downloadOriginal: "Download English PDF",
    downloadArabic: "Download Arabic PDF",
    downloadBilingual: "Download Bilingual PDF",
    original: "English Original Document",
    arabic: "Arabic Translation",
    pendingTitle: "Arabic translation has not been generated yet",
    pendingHint: "Generate a complete English-to-Arabic translation. The original report remains unchanged.",
    generated: "Translation generated",
    stored: "PDF downloaded and stored with this translation.",
    project: "Project",
    projectReference: "Project Reference",
    stage: "Stage",
    term: "Term",
    document: "Document",
    documentNumber: "Document Number",
    visitNumber: "Visit Number",
    date: "Date",
    status: "Status",
    subject: "Subject",
    type: "Type",
    checklist: "Inspection Checklist",
    approvals: "Approval Information",
    evidence: "Image Evidence",
    attachments: "Related Documents",
    translatedAttachments: "Translated Attachment Content",
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
    generate: "إنشاء الترجمة",
    regenerate: "إعادة إنشاء الترجمة",
    generating: "جارٍ ترجمة المستند بالكامل...",
    downloadOriginal: "تنزيل ملف PDF الإنجليزي",
    downloadArabic: "تنزيل ملف PDF العربي",
    downloadBilingual: "تنزيل ملف PDF ثنائي اللغة",
    original: "المستند الإنجليزي الأصلي",
    arabic: "الترجمة العربية",
    pendingTitle: "لم يتم إنشاء الترجمة العربية بعد",
    pendingHint: "أنشئ ترجمة كاملة من الإنجليزية إلى العربية مع بقاء التقرير الأصلي دون تغيير.",
    generated: "تم إنشاء الترجمة",
    stored: "تم تنزيل ملف PDF وحفظه مع هذه الترجمة.",
    project: "المشروع",
    projectReference: "مرجع المشروع",
    stage: "المرحلة",
    term: "البند",
    document: "المستند",
    documentNumber: "رقم المستند",
    visitNumber: "رقم الزيارة",
    date: "التاريخ",
    status: "الحالة",
    subject: "الموضوع",
    type: "النوع",
    checklist: "قائمة فحص التفتيش",
    approvals: "معلومات الاعتماد",
    evidence: "صور الإثبات",
    attachments: "المستندات المرتبطة",
    translatedAttachments: "محتوى المرفقات المترجم",
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
  noContent: string
  noApprovals: string
  noAttachments: string
  checked: string
  unchecked: string
}

function formatDate(value: string, language: "en" | "ar", includeTime = false) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat(language === "ar" ? "ar" : "en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date)
}

function filenameWithoutExtension(value: string) {
  return value.replace(/\.[^.]+$/, "")
}

export function StageTranslationViewer({ data }: { data: StageTranslationPageData }) {
  const { locale } = useI18n()
  const copy = COPY[locale]
  const [translation, setTranslation] = useState<TranslationRecordState>(data.translation)
  const [busy, setBusy] = useState<"generate" | "original" | "arabic" | "bilingual" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const labelsEn = COPY.en
  const labelsAr = COPY.ar
  const translated = translation?.translatedContent ?? null
  const sourcePdf = getSourcePdfAttachment(data)
  const translationIsStale = Boolean(
    translation?.generatedAt && new Date(data.response.updatedAt).getTime() > new Date(translation.generatedAt).getTime(),
  )

  async function generateTranslation() {
    setBusy("generate")
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch("/api/stage-translations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: data.project.id, stageId: data.stage.id, termId: data.term.id }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || "Unable to generate the document translation.")
      const now = new Date().toISOString()
      const next = payload.translation as Partial<StageTranslationRecord>
      setTranslation({
        id: String(next.id),
        status: "completed",
        originalContent: next.originalContent ?? data.response.content,
        translatedContent: next.translatedContent ?? null,
        generatedAt: next.generatedAt ?? now,
        createdAt: next.createdAt ?? translation?.createdAt ?? now,
        updatedAt: next.updatedAt ?? now,
        originalPdfPath: null,
        arabicPdfPath: null,
        bilingualPdfPath: null,
      })
      setSuccess(copy.generated)
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Unable to generate the document translation.")
    } finally {
      setBusy(null)
    }
  }

  async function storePdf(blob: Blob, filename: string, kind: "original" | "arabic" | "bilingual") {
    if (!translation) throw new Error("Generate the translation before exporting PDFs.")
    const form = new FormData()
    form.set("projectId", data.project.id)
    form.set("translationId", translation.id)
    form.set("kind", kind)
    form.set("file", new File([blob], filename, { type: "application/pdf" }))
    const response = await fetch("/api/stage-translations/pdf", { method: "POST", body: form })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.error || copy.pdfError)
    const path = String(payload.storagePath)
    setTranslation((current) => current ? {
      ...current,
      originalPdfPath: kind === "original" ? path : current.originalPdfPath,
      arabicPdfPath: kind === "arabic" ? path : current.arabicPdfPath,
      bilingualPdfPath: kind === "bilingual" ? path : current.bilingualPdfPath,
    } : current)
  }

  async function downloadPdf(kind: "original" | "arabic" | "bilingual") {
    if (kind !== "original" && (!translation?.translatedContent || translationIsStale)) return
    const storedPath = translation
      ? kind === "original"
        ? translation.originalPdfPath
        : kind === "arabic"
          ? translation.arabicPdfPath
          : translation.bilingualPdfPath
      : null
    if (storedPath && translation && !(kind === "original" && sourcePdf)) {
      const params = new URLSearchParams({ projectId: data.project.id, translationId: translation.id, kind })
      window.location.assign(`/api/stage-translations/pdf?${params.toString()}`)
      return
    }
    setBusy(kind)
    setError(null)
    setSuccess(null)
    try {
      const exported = await exportTranslationPdf({ data, translation, kind })
      if (translation) {
        await storePdf(exported.blob, exported.filename, kind)
        setSuccess(copy.stored)
      } else {
        setSuccess(kind === "original" ? copy.downloadOriginal : copy.stored)
      }
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : copy.pdfError)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <Link href={`/projects/${data.project.id}/stages/${data.stage.id}/terms/${data.term.id}`} className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 flip-rtl" />{copy.back}
      </Link>

      <Card className="overflow-hidden py-0">
        <div className="border-b bg-card px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary"><Languages className="size-4" />{copy.eyebrow}</div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{copy.title}</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{copy.subtitle}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline">{data.project.name}</Badge>
                <Badge variant="outline">{data.stage.name}</Badge>
                <Badge variant="outline">{data.term.name}</Badge>
                <Badge variant="outline" className={statusTone(data.response.status as any)}>{statusLabel(data.response.status as any, locale)}</Badge>
              </div>
            </div>
            <div className="flex max-w-full flex-wrap gap-2 xl:max-w-[650px] xl:justify-end">
              <Button onClick={() => void generateTranslation()} disabled={busy !== null}>
                {busy === "generate" ? <Loader2 className="size-4 animate-spin" /> : translation ? <RefreshCw className="size-4" /> : <Sparkles className="size-4" />}
                {busy === "generate" ? copy.generating : translation ? copy.regenerate : copy.generate}
              </Button>
              <Button variant="outline" onClick={() => void downloadPdf("original")} disabled={busy !== null}>
                {busy === "original" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}{copy.downloadOriginal}
              </Button>
              <Button variant="outline" onClick={() => void downloadPdf("arabic")} disabled={!translated || translationIsStale || busy !== null}>
                {busy === "arabic" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}{copy.downloadArabic}
              </Button>
              <Button variant="outline" onClick={() => void downloadPdf("bilingual")} disabled={!translated || translationIsStale || busy !== null}>
                {busy === "bilingual" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}{copy.downloadBilingual}
              </Button>
            </div>
          </div>
        </div>
        <CardContent className="grid gap-px bg-border p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <HeaderMeta label={copy.project} value={data.project.name} />
          <HeaderMeta label={copy.stage} value={data.stage.name} />
          <HeaderMeta label={copy.term} value={data.term.name} />
          <HeaderMeta label={copy.documentNumber} value={data.response.reportNumber} />
          <HeaderMeta label={copy.document} value={data.response.reportTitle} />
          <HeaderMeta label={copy.date} value={formatDate(data.response.createdAt, locale)} />
        </CardContent>
      </Card>

      {error ? <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</div> : null}
      {translationIsStale ? <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><AlertCircle className="mt-0.5 size-4 shrink-0" />{copy.stale}</div> : null}
      {success ? <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />{success}</div> : null}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {sourcePdf ? (
          <SourcePdfViewer data={data} attachment={sourcePdf} title={copy.original} />
        ) : (
          <LanguageReport
            language="en"
            title={copy.original}
            data={data}
            content={data.response.content}
            labels={labelsEn}
            generatedAt={translation?.generatedAt ?? null}
          />
        )}
        {translated ? (
          <LanguageReport
            language="ar"
            title={copy.arabic}
            data={data}
            content={translated}
            labels={labelsAr}
            generatedAt={translation?.generatedAt ?? null}
          />
        ) : (
          <Card className="min-h-[560px] py-0">
            <CardContent className="flex min-h-[560px] flex-col items-center justify-center px-6 text-center">
              <span className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Languages className="size-8" /></span>
              <h2 className="text-xl font-semibold">{copy.pendingTitle}</h2>
              <p className="mt-2 max-w-lg text-sm text-muted-foreground">{copy.pendingHint}</p>
              <Button className="mt-5" onClick={() => void generateTranslation()} disabled={busy !== null}>
                {busy === "generate" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{busy === "generate" ? copy.generating : copy.generate}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

    </div>
  )
}

function HeaderMeta({ label, value }: { label: string; value: string }) {
  return <div className="min-h-20 bg-card px-4 py-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 line-clamp-2 text-sm font-semibold">{value || "—"}</p></div>
}

const LanguageReport = forwardRef<HTMLElement, {
  language: "en" | "ar"
  title: string
  data: StageTranslationPageData
  content: TranslationReportContent
  labels: ReportLabels
  generatedAt: string | null
}>(function LanguageReport({ language, title, data, content, labels, generatedAt }, ref) {
  const isArabic = language === "ar"
  const evidence = data.response.attachments.filter((item) => item.attachmentKind === "evidence_image")
  const documents = data.response.attachments.filter((item) => item.attachmentKind === "document")

  return (
    <article ref={ref} lang={language} dir={isArabic ? "rtl" : "ltr"} className={cn("stage-translation-report min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-sm", isArabic && "font-arabic")}>
      <div className="h-2 bg-blue-700" />
      <header className="stage-translation-no-break border-b border-slate-200 bg-slate-50 px-5 py-5 sm:px-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-blue-700"><Languages className="size-4" />{title}</div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-950">{content.reportTitle || data.response.reportTitle}</h2>
            <p className="mt-1 text-sm text-slate-600">{content.termName || data.term.name}</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">{isArabic ? "AR" : "EN"}</div>
        </div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <ReportMeta label={labels.project} value={data.project.name} />
          <ReportMeta label={labels.projectReference} value={data.project.code || "—"} />
          <ReportMeta label={labels.stage} value={content.stageName || data.stage.name} />
          <ReportMeta label={labels.term} value={content.termName || data.term.name} />
          <ReportMeta label={labels.documentNumber} value={data.response.reportNumber} />
          <ReportMeta label={labels.visitNumber} value={String(data.response.visitNumber)} />
          <ReportMeta label={labels.date} value={formatDate(data.response.createdAt, language)} />
          <ReportMeta label={labels.status} value={statusLabel(data.response.status as any, language)} />
          <ReportMeta label={labels.type} value={content.reportType || "—"} />
          <ReportMeta label={labels.subject} value={content.subject || "—"} />
        </dl>
        {generatedAt ? <p className="mt-3 text-[11px] text-slate-500">{isArabic ? "تاريخ إنشاء الترجمة" : "Translation generated"}: {formatDate(generatedAt, language, true)}</p> : null}
      </header>

      <div className="space-y-7 px-5 py-6 sm:px-7 sm:py-8">
        {SECTION_LABELS.map((section) => (
          <ReportSection key={section.key} title={isArabic ? section.ar : section.en} html={content.sections[section.key]} empty={labels.noContent} />
        ))}
        <ChecklistSection content={content} labels={labels} language={language} />
        <ApprovalSection content={content} labels={labels} language={language} />
        <EvidenceSection attachments={evidence} title={labels.evidence} empty={labels.noAttachments} />
        <DocumentsSection documents={documents} content={content} labels={labels} language={language} />
      </div>

      <footer className="stage-translation-no-break border-t border-slate-200 bg-slate-50 px-5 py-3 text-center text-[11px] text-slate-500 sm:px-7">
        {data.project.name} · {data.response.reportNumber} · {title}
      </footer>
    </article>
  )
})

function ReportMeta({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3"><dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold text-slate-900">{value || "—"}</dd></div>
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

function ChecklistSection({ content, labels, language }: { content: TranslationReportContent; labels: ReportLabels; language: "en" | "ar" }) {
  return <section><SectionHeading icon={<CheckCircle2 className="size-4" />} title={labels.checklist} /><ChecklistBody content={content} labels={labels} language={language} /></section>
}

function ChecklistBody({ content, labels, language }: { content: TranslationReportContent; labels: ReportLabels; language: "en" | "ar" }) {
  if (!content.checklist.length) return <p className="text-sm italic text-slate-500">{labels.noContent}</p>
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full border-collapse text-sm">
        <tbody>{content.checklist.map((item, index) => (
          <tr key={item.id} className="border-b border-slate-100 last:border-0">
            <td className="w-12 bg-slate-50 px-3 py-3 text-center font-semibold text-slate-500">{index + 1}</td>
            <td className="px-3 py-3"><p className="font-semibold text-slate-900">{item.label}</p>{item.notes ? <p className="mt-1 text-xs text-slate-500">{item.notes}</p> : null}</td>
            <td className="w-28 px-3 py-3 text-end"><span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold", item.checked ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>{item.checked ? labels.checked : labels.unchecked}</span></td>
          </tr>
        ))}</tbody>
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
