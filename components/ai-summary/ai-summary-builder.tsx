"use client"

import { useMemo, useRef, useState, type ChangeEvent, type Dispatch, type ReactNode, type SetStateAction } from "react"
import {
  AlertCircle,
  Bot,
  Check,
  ClipboardCheck,
  Copy,
  Download,
  FileText,
  FolderKanban,
  ImageIcon,
  Loader2,
  Paperclip,
  Sparkles,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { AiSummarySourceData } from "@/lib/ai-summary/sources"
import { SummaryReport } from "@/components/ai-summary/summary-markdown"
import { exportSummaryPdf } from "@/lib/ai-summary/client-pdf"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

const COPY = {
  en: {
    title: "AI Summary",
    subtitle: "Create a project summary from selected inspection reports and project documents.",
    noProject: "Select a project to use AI Summary",
    noProjectHint: "Choose a project from the project selector. Summaries are always limited to the active project.",
    project: "Current project",
    sources: "Select source records",
    evidenceAutomatic: "Related evidence is included automatically",
    evidenceHint: "Selecting a report includes its response text, feedback, observations, findings, recommendations, corrective actions, approval history, images, and attached documents. There is no separate image selection step.",
    inspections: "Inspection reports",
    documents: "Project documents",
    noInspections: "No inspection responses are available for this project.",
    noDocuments: "No project documents are available.",
    selectAll: "Select all",
    clear: "Clear",
    selected: "selected",
    images: "images",
    files: "files",
    approvals: "approvals",
    instructions: "Summary focus (optional)",
    instructionsPlaceholder: "Example: Focus on overdue corrective actions, rejected items, and handover risks.",
    generate: "Generate Summary",
    generating: "Reviewing selected records and their evidence...",
    result: "Bilingual project summary",
    englishSummary: "English Summary",
    arabicSummary: "Arabic Summary",
    downloadEnglish: "EN",
    downloadArabic: "AR",
    preparingPdf: "Preparing PDF...",
    copyEnglish: "Copy English",
    copyArabic: "Copy Arabic",
    copied: "Copied",
    pdfError: "Unable to export the PDF. Please try again.",
    selectSource: "Select at least one inspection report or project document.",
    unavailable: "No source records are available yet.",
  },
  ar: {
    title: "الملخص بالذكاء الاصطناعي",
    subtitle: "إنشاء ملخص للمشروع من تقارير التفتيش ومستندات المشروع المحددة.",
    noProject: "اختر مشروعاً لاستخدام الملخص الذكي",
    noProjectHint: "اختر مشروعاً من محدد المشاريع. يقتصر الملخص دائماً على المشروع النشط.",
    project: "المشروع الحالي",
    sources: "اختر السجلات المصدرية",
    evidenceAutomatic: "يتم تضمين الأدلة المرتبطة تلقائياً",
    evidenceHint: "عند اختيار تقرير، يتم تضمين نص الاستجابة والملاحظات والنتائج والتوصيات والإجراءات التصحيحية وسجل الاعتماد والصور والمستندات المرفقة تلقائياً. لا توجد خطوة منفصلة لاختيار الصور.",
    inspections: "تقارير التفتيش",
    documents: "مستندات المشروع",
    noInspections: "لا توجد استجابات تفتيش متاحة لهذا المشروع.",
    noDocuments: "لا توجد مستندات للمشروع.",
    selectAll: "تحديد الكل",
    clear: "مسح",
    selected: "محدد",
    images: "صور",
    files: "ملفات",
    approvals: "اعتمادات",
    instructions: "تركيز الملخص (اختياري)",
    instructionsPlaceholder: "مثال: ركّز على الإجراءات التصحيحية المتأخرة والعناصر المرفوضة ومخاطر التسليم.",
    generate: "إنشاء الملخص",
    generating: "جارٍ مراجعة السجلات المحددة والأدلة المرتبطة...",
    result: "ملخص المشروع باللغتين",
    englishSummary: "الملخص الإنجليزي",
    arabicSummary: "الملخص العربي",
    downloadEnglish: "EN",
    downloadArabic: "AR",
    preparingPdf: "جارٍ إعداد ملف PDF...",
    copyEnglish: "نسخ الإنجليزية",
    copyArabic: "نسخ العربية",
    copied: "تم النسخ",
    pdfError: "تعذر تصدير ملف PDF. يرجى المحاولة مرة أخرى.",
    selectSource: "اختر تقرير تفتيش أو مستند مشروع واحداً على الأقل.",
    unavailable: "لا توجد سجلات مصدرية متاحة بعد.",
  },
} as const

function formatDate(value: string, locale: "en" | "ar") {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date)
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function AiSummaryBuilder({ data }: { data: AiSummarySourceData | null }) {
  const { locale } = useI18n()
  const copy = COPY[locale as keyof typeof COPY]
  const [selectedResponses, setSelectedResponses] = useState<Set<string>>(new Set())
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set())
  const [instructions, setInstructions] = useState("")
  const [summaries, setSummaries] = useState<{ en: string; ar: string } | null>(null)
  const [generatedAt, setGeneratedAt] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<"en" | "ar" | null>(null)
  const [exporting, setExporting] = useState<"en" | "ar" | null>(null)
  const englishReportRef = useRef<HTMLElement>(null)
  const arabicReportRef = useRef<HTMLElement>(null)

  const selectedCount = selectedResponses.size + selectedDocuments.size
  const totalSources = (data?.inspections.length ?? 0) + (data?.documents.length ?? 0)
  const evidenceTotals = useMemo(() => {
    if (!data) return { images: 0, files: 0, approvals: 0 }
    const inspections = data.inspections.filter((item) => selectedResponses.has(item.id))
    const documents = data.documents.filter((item) => selectedDocuments.has(item.id))
    return {
      images: inspections.reduce((sum, item) => sum + item.imageCount, 0) + documents.reduce((sum, item) => sum + item.imageCount, 0),
      files: inspections.reduce((sum, item) => sum + item.documentCount, 0) + documents.reduce((sum, item) => sum + item.fileCount, 0),
      approvals: inspections.reduce((sum, item) => sum + item.approvalCount, 0),
    }
  }, [data, selectedDocuments, selectedResponses])

  function toggle(setter: Dispatch<SetStateAction<Set<string>>>, id: string) {
    setter((current: Set<string>) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setError(null)
  }

  async function generate() {
    if (!data || selectedCount === 0) {
      setError(copy.selectSource)
      return
    }
    setBusy(true)
    setError(null)
    setSummaries(null)
    try {
      const requestSummary = async (summaryLocale: "en" | "ar") => {
        const response = await fetch("/api/ai-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: data.project.id,
            responseIds: Array.from(selectedResponses),
            documentIds: Array.from(selectedDocuments),
            instructions,
            locale: summaryLocale,
          }),
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.error || "Unable to generate the AI summary.")
        if (typeof payload?.summary !== "string" || !payload.summary.trim()) throw new Error("The AI service returned an empty summary.")
        return payload.summary.trim()
      }

      const [english, arabic] = await Promise.all([requestSummary("en"), requestSummary("ar")])
      setSummaries({ en: english, ar: arabic })
      setGeneratedAt(new Date().toISOString())
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Unable to generate the AI summary.")
    } finally {
      setBusy(false)
    }
  }

  async function copySummary(language: "en" | "ar") {
    const summary = summaries?.[language]
    if (!summary) return
    await navigator.clipboard.writeText(summary)
    setCopied(language)
    window.setTimeout(() => setCopied(null), 1800)
  }

  async function downloadPdf(language: "en" | "ar") {
    if (!data || !summaries) return
    const source = language === "en" ? englishReportRef.current : arabicReportRef.current
    if (!source) return
    setExporting(language)
    setError(null)
    try {
      await exportSummaryPdf({
        source,
        projectName: data.project.name,
        projectReference: data.project.code,
        language,
      })
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : copy.pdfError)
    } finally {
      setExporting(null)
    }
  }

  if (!data) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <Card>
          <CardContent className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
            <span className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FolderKanban className="size-8" /></span>
            <h1 className="text-2xl font-semibold">{copy.noProject}</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">{copy.noProjectHint}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary"><Sparkles className="size-4" />{copy.project}: {data.project.name}</div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{copy.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
          </div>
          <Badge variant="outline" className="w-fit px-3 py-1.5">{selectedCount} {copy.selected}</Badge>
        </div>
      </div>

      <Card className="border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20">
        <CardContent className="flex gap-3 px-5 py-4">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><ImageIcon className="size-4" /></span>
          <div>
            <p className="font-semibold text-blue-950 dark:text-blue-100">{copy.evidenceAutomatic}</p>
            <p className="mt-1 text-sm leading-6 text-blue-800/80 dark:text-blue-200/80">{copy.evidenceHint}</p>
            {selectedCount ? (
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-blue-800 dark:text-blue-200">
                <span className="rounded-full bg-white/80 px-2.5 py-1 dark:bg-blue-950/60">{evidenceTotals.images} {copy.images}</span>
                <span className="rounded-full bg-white/80 px-2.5 py-1 dark:bg-blue-950/60">{evidenceTotals.files} {copy.files}</span>
                <span className="rounded-full bg-white/80 px-2.5 py-1 dark:bg-blue-950/60">{evidenceTotals.approvals} {copy.approvals}</span>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <SourceSection
          title={copy.inspections}
          icon={<ClipboardCheck className="size-5" />}
          count={data.inspections.length}
          empty={copy.noInspections}
          onSelectAll={() => setSelectedResponses(new Set(data.inspections.map((item) => item.id)))}
          onClear={() => setSelectedResponses(new Set())}
          selectAllLabel={copy.selectAll}
          clearLabel={copy.clear}
        >
          {data.inspections.map((item) => (
            <SourceCard key={item.id} selected={selectedResponses.has(item.id)} onToggle={() => toggle(setSelectedResponses, item.id)}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{item.title}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{item.stageName} · {item.reportNumber}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">{statusLabel(item.status)}</Badge>
                  {item.imageCount ? <EvidenceBadge icon={<ImageIcon className="size-3" />} text={`${item.imageCount} ${copy.images}`} /> : null}
                  {item.documentCount ? <EvidenceBadge icon={<Paperclip className="size-3" />} text={`${item.documentCount} ${copy.files}`} /> : null}
                  {item.approvalCount ? <EvidenceBadge icon={<Check className="size-3" />} text={`${item.approvalCount} ${copy.approvals}`} /> : null}
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{formatDate(item.updatedAt, locale)}</span>
            </SourceCard>
          ))}
        </SourceSection>

        <SourceSection
          title={copy.documents}
          icon={<FileText className="size-5" />}
          count={data.documents.length}
          empty={copy.noDocuments}
          onSelectAll={() => setSelectedDocuments(new Set(data.documents.map((item) => item.id)))}
          onClear={() => setSelectedDocuments(new Set())}
          selectAllLabel={copy.selectAll}
          clearLabel={copy.clear}
        >
          {data.documents.map((item) => (
            <SourceCard key={item.id} selected={selectedDocuments.has(item.id)} onToggle={() => toggle(setSelectedDocuments, item.id)}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{item.title}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{item.reference} · {item.typeLabel}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">{statusLabel(item.status)}</Badge>
                  {item.imageCount ? <EvidenceBadge icon={<ImageIcon className="size-3" />} text={`${item.imageCount} ${copy.images}`} /> : null}
                  {item.fileCount ? <EvidenceBadge icon={<Paperclip className="size-3" />} text={`${item.fileCount} ${copy.files}`} /> : null}
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{formatDate(item.updatedAt, locale)}</span>
            </SourceCard>
          ))}
        </SourceSection>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="size-5 text-primary" />{copy.sources}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <label className="block text-sm font-medium" htmlFor="ai-summary-instructions">{copy.instructions}</label>
          <textarea
            id="ai-summary-instructions"
            value={instructions}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setInstructions(event.target.value.slice(0, 2000))}
            placeholder={copy.instructionsPlaceholder}
            rows={4}
            className="flex w-full resize-y rounded-xl border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          {error ? <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</div> : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">{totalSources ? `${selectedCount} / ${totalSources} ${copy.selected}` : copy.unavailable}</p>
            <Button type="button" onClick={generate} disabled={busy || selectedCount === 0} className="min-w-48">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {busy ? copy.generating : copy.generate}
            </Button>
          </div>
        </CardContent>
      </Card>

      {summaries ? (
        <section className="space-y-4" aria-labelledby="ai-summary-result-title">
          <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <h2 id="ai-summary-result-title" className="text-xl font-semibold tracking-tight">{copy.result}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{data.project.name}{data.project.code ? ` · ${data.project.code}` : ""}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => downloadPdf("en")} disabled={exporting !== null}>
                {exporting === "en" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                {exporting === "en" ? copy.preparingPdf : copy.downloadEnglish}
              </Button>
              <Button type="button" variant="outline" onClick={() => downloadPdf("ar")} disabled={exporting !== null}>
                {exporting === "ar" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                {exporting === "ar" ? copy.preparingPdf : copy.downloadArabic}
              </Button>
            </div>
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-2" dir="ltr">
            <div className="min-w-0 space-y-3" dir="ltr">
              <div className="flex items-center justify-between gap-3 px-1">
                <h3 className="font-semibold">{copy.englishSummary}</h3>
                <Button type="button" variant="ghost" size="sm" onClick={() => copySummary("en")}>
                  {copied === "en" ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied === "en" ? copy.copied : copy.copyEnglish}
                </Button>
              </div>
              <SummaryReport
                ref={englishReportRef}
                language="en"
                markdown={summaries.en}
                projectName={data.project.name}
                projectReference={data.project.code}
                generatedAt={generatedAt}
              />
            </div>

            <div className="min-w-0 space-y-3 font-arabic" dir="rtl">
              <div className="flex items-center justify-between gap-3 px-1">
                <h3 className="font-semibold">{copy.arabicSummary}</h3>
                <Button type="button" variant="ghost" size="sm" onClick={() => copySummary("ar")}>
                  {copied === "ar" ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied === "ar" ? copy.copied : copy.copyArabic}
                </Button>
              </div>
              <SummaryReport
                ref={arabicReportRef}
                language="ar"
                markdown={summaries.ar}
                projectName={data.project.name}
                projectReference={data.project.code}
                generatedAt={generatedAt}
              />
            </div>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function SourceSection({
  title,
  icon,
  count,
  empty,
  onSelectAll,
  onClear,
  selectAllLabel,
  clearLabel,
  children,
}: {
  title: string
  icon: ReactNode
  count: number
  empty: string
  onSelectAll: () => void
  onClear: () => void
  selectAllLabel: string
  clearLabel: string
  children: ReactNode
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">{icon}{title}<Badge variant="secondary">{count}</Badge></CardTitle>
          {count ? <div className="flex gap-1"><Button type="button" variant="ghost" size="sm" onClick={onSelectAll}>{selectAllLabel}</Button><Button type="button" variant="ghost" size="sm" onClick={onClear}>{clearLabel}</Button></div> : null}
        </div>
      </CardHeader>
      <CardContent className="max-h-[520px] space-y-3 overflow-y-auto p-4">
        {count ? children : <div className="flex min-h-40 items-center justify-center px-5 text-center text-sm text-muted-foreground">{empty}</div>}
      </CardContent>
    </Card>
  )
}

function SourceCard({ selected, onToggle, children }: { selected: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onToggle}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border p-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary bg-primary/5" : "hover:bg-muted/40",
      )}
    >
      <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border", selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background")}>
        {selected ? <Check className="size-3.5" /> : null}
      </span>
      {children}
    </button>
  )
}

function EvidenceBadge({ icon, text }: { icon: ReactNode; text: string }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">{icon}{text}</span>
}
