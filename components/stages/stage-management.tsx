"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  CircleDot,
  ClipboardList,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  createStage,
  createStageTerm,
  deleteStage,
  deleteStageTerm,
  moveStage,
  moveStageTerm,
  setStageActive,
  setStageTermStatus,
  updateStage,
  updateStageTerm,
} from "@/lib/actions/stages"
import type {
  StageManagementData,
  StageRecord,
  StageTermRecord,
} from "@/lib/db/stages"
import { type StageTermStatus } from "@/lib/stages/config"
import { useI18n } from "@/lib/i18n"

const COPY = {
  en: {
    eyebrow: "Stage template library",
    intro: "Define the construction lifecycle and the terms required in each stage. These templates will be used later when project stage execution is enabled.",
    addStage: "Add Stage",
    stages: "Stages",
    reports: "Terms",
    requiredReports: "Required terms",
    required: "Required",
    active: "Active",
    disabled: "Disabled",
    stage: "Stage",
    reportsLabel: "Terms",
    addReport: "Add Term",
    editStage: "Edit stage",
    disableStage: "Disable stage",
    enableStage: "Enable stage",
    deleteStage: "Delete stage",
    moveUp: "Move up",
    moveDown: "Move down",
    reportName: "Term Name",
    requirement: "Required / Optional",
    approval: "Approval",
    status: "Status",
    actions: "Actions",
    optional: "Optional",
    approvalRequired: "Required",
    editReport: "Edit Term",
    disableReport: "Disable Term",
    enableReport: "Enable Term",
    deleteReport: "Delete Term",
    createStageTitle: "Create stage",
    editStageTitle: "Edit stage",
    stageDialogDescription: "Set the stage name and a short description for administrators.",
    stageName: "Stage name",
    description: "Description",
    descriptionPlaceholder: "Optional guidance about when this stage is used",
    cancel: "Cancel",
    create: "Create",
    save: "Save changes",
    addReportTitle: "Add Term",
    editReportTitle: "Edit Term",
    termDialogDescription: "Set the term name, requirement, approval, and status.",
    requiredToggle: "Required / Optional",
    approvalToggle: "Approval is required",
    deleteTitle: "Confirm deletion",
    deleteStageDescription: "Deleting this stage also deletes all terms inside it. This action cannot be undone.",
    deleteTermDescription: "Deleting this term cannot be undone.",
    delete: "Delete",
    emptyTitle: "No stages yet",
    emptyDescription: "Create the first construction stage to begin building your template library.",
    noReports: "No terms have been added to this stage yet.",
    success: "Changes saved successfully.",
  },
  ar: {
    eyebrow: "مكتبة قوالب المراحل",
    intro: "حدّد دورة حياة المشروع الإنشائي والبنود المطلوبة في كل مرحلة. ستُستخدم هذه القوالب لاحقًا عند تفعيل تنفيذ مراحل المشروع.",
    addStage: "إضافة مرحلة",
    stages: "المراحل",
    reports: "البنود",
    requiredReports: "البنود الإلزامية",
    required: "إلزامي",
    active: "نشط",
    disabled: "معطّل",
    stage: "المرحلة",
    reportsLabel: "البنود",
    addReport: "إضافة بند",
    editStage: "تعديل المرحلة",
    disableStage: "تعطيل المرحلة",
    enableStage: "تفعيل المرحلة",
    deleteStage: "حذف المرحلة",
    moveUp: "تحريك لأعلى",
    moveDown: "تحريك لأسفل",
    reportName: "اسم البند",
    requirement: "إلزامي / اختياري",
    approval: "الموافقة",
    status: "الحالة",
    actions: "الإجراءات",
    optional: "اختياري",
    approvalRequired: "مطلوبة",
    editReport: "تعديل البند",
    disableReport: "تعطيل البند",
    enableReport: "تفعيل البند",
    deleteReport: "حذف البند",
    createStageTitle: "إنشاء مرحلة",
    editStageTitle: "تعديل المرحلة",
    stageDialogDescription: "حدّد اسم المرحلة ووصفًا مختصرًا للمسؤولين.",
    stageName: "اسم المرحلة",
    description: "الوصف",
    descriptionPlaceholder: "إرشادات اختيارية حول وقت استخدام هذه المرحلة",
    cancel: "إلغاء",
    create: "إنشاء",
    save: "حفظ التغييرات",
    addReportTitle: "إضافة بند",
    editReportTitle: "تعديل البند",
    termDialogDescription: "حدّد اسم البند ومتطلباته والموافقة والحالة.",
    requiredToggle: "إلزامي / اختياري",
    approvalToggle: "الموافقة مطلوبة",
    deleteTitle: "تأكيد الحذف",
    deleteStageDescription: "سيؤدي حذف المرحلة إلى حذف جميع البنود بداخلها. لا يمكن التراجع عن هذا الإجراء.",
    deleteTermDescription: "لا يمكن التراجع عن حذف هذا البند.",
    delete: "حذف",
    emptyTitle: "لا توجد مراحل بعد",
    emptyDescription: "أنشئ أول مرحلة إنشائية لبدء بناء مكتبة القوالب.",
    noReports: "لم تتم إضافة بنود إلى هذه المرحلة بعد.",
    success: "تم حفظ التغييرات بنجاح.",
  },
} as const

type StageDialogState = { mode: "create"; stage: null } | { mode: "edit"; stage: StageRecord }
type TermDialogState =
  | { mode: "create"; stage: StageRecord; term: null }
  | { mode: "edit"; stage: StageRecord; term: StageTermRecord }
type DeleteTarget =
  | { kind: "stage"; id: string; name: string }
  | { kind: "term"; id: string; name: string }

function SummaryCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function TermTableColumns() {
  return (
    <colgroup>
      <col style={{ width: "45%" }} />
      <col style={{ width: "15%" }} />
      <col style={{ width: "15%" }} />
      <col style={{ width: "15%" }} />
      <col style={{ width: "10%" }} />
    </colgroup>
  )
}

export function StageManagement({
  organization,
  data,
}: {
  organization: { id: string; name: string }
  data: StageManagementData
}) {
  const router = useRouter()
  const { locale } = useI18n()
  const c = COPY[locale]
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(data.stages.map((stage) => stage.id)))
  const [stageDialog, setStageDialog] = useState<StageDialogState | null>(null)
  const stageDialogVersion = useRef(0)
  const [termDialog, setTermDialog] = useState<TermDialogState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null)
  const [stageSubmitting, setStageSubmitting] = useState(false)
  const [isPending, startTransition] = useTransition()

  const totalReports = data.stages.reduce((sum, stage) => sum + stage.terms.length, 0)
  const requiredReports = data.stages.reduce(
    (sum, stage) => sum + stage.terms.filter((term) => term.required).length,
    0,
  )

  function openStageDialog(dialog: StageDialogState) {
    stageDialogVersion.current += 1
    setStageDialog(dialog)
  }

  function closeStageDialog() {
    stageDialogVersion.current += 1
    setStageDialog(null)
  }

  function execute(action: () => Promise<{ ok: boolean; error?: string }>, onSuccess?: () => void) {
    setFeedback(null)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error || "Something went wrong." })
        return
      }
      onSuccess?.()
      setFeedback({ tone: "success", message: c.success })
      router.refresh()
    })
  }

  async function submitStage(values: { name: string; description: string }) {
    const currentDialog = stageDialog
    if (!currentDialog || stageSubmitting) return
    const dialogVersion = stageDialogVersion.current

    setFeedback(null)
    setStageSubmitting(true)
    try {
      const result = await (currentDialog.mode === "create"
        ? createStage({ organizationId: organization.id, ...values })
        : updateStage({ stageId: currentDialog.stage.id, ...values }))

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error || "Something went wrong." })
        return
      }

      // Close immediately as a normal state update. Refreshing the server data is
      // intentionally scheduled afterwards so it cannot keep the dialog mounted.
      if (stageDialogVersion.current === dialogVersion) closeStageDialog()
      setFeedback({ tone: "success", message: c.success })
      startTransition(() => router.refresh())
    } catch {
      setFeedback({ tone: "error", message: "Something went wrong." })
    } finally {
      setStageSubmitting(false)
    }
  }

  function toggleStage(stageId: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(stageId)) next.delete(stageId)
      else next.add(stageId)
      return next
    })
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{c.eyebrow}</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{organization.name}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{c.intro}</p>
        </div>
        <Button type="button" size="lg" onClick={() => openStageDialog({ mode: "create", stage: null })}>
          <Plus data-icon="inline-start" />
          {c.addStage}
        </Button>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard icon={ClipboardList} label={c.stages} value={data.stages.length} />
        <SummaryCard icon={FileText} label={c.reports} value={totalReports} />
        <SummaryCard icon={ShieldCheck} label={c.requiredReports} value={requiredReports} />
      </div>

      {feedback ? (
        <div
          role="status"
          className={
            feedback.tone === "error"
              ? "rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              : "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
          }
        >
          {feedback.message}
        </div>
      ) : null}

      {data.stages.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <ClipboardList className="size-7" />
            </span>
            <h3 className="mt-4 text-lg font-semibold">{c.emptyTitle}</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">{c.emptyDescription}</p>
            <Button className="mt-5" onClick={() => openStageDialog({ mode: "create", stage: null })}>
              <Plus data-icon="inline-start" />
              {c.addStage}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.stages.map((stage, stageIndex) => {
            const isExpanded = expanded.has(stage.id)
            return (
              <Card key={stage.id} className={`overflow-hidden !gap-0 !py-0${!stage.active ? " opacity-75" : ""}`}>
                <CardHeader className="border-b !px-4 !py-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? "Collapse" : "Expand"} ${stage.name}`}
                      onClick={() => toggleStage(stage.id)}
                      className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                          {stageIndex + 1}
                        </span>
                        <CardTitle className="text-base">{stage.name}</CardTitle>
                        <Badge variant={stage.active ? "secondary" : "outline"}>
                          {stage.active ? c.active : c.disabled}
                        </Badge>
                      </div>
                      <CardDescription className="mt-1">
                        {stage.description || `${stage.terms.length} ${c.reportsLabel}`}
                      </CardDescription>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={c.moveUp}
                        disabled={stageIndex === 0 || isPending}
                        onClick={() => execute(() => moveStage({ stageId: stage.id, direction: "up" }))}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={c.moveDown}
                        disabled={stageIndex === data.stages.length - 1 || isPending}
                        onClick={() => execute(() => moveStage({ stageId: stage.id, direction: "down" }))}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="hidden sm:inline-flex"
                        onClick={() => setTermDialog({ mode: "create", stage, term: null })}
                      >
                        <Plus data-icon="inline-start" />
                        {c.addReport}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <button
                              type="button"
                              aria-label={c.actions}
                              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                            >
                              <MoreHorizontal className="size-4" />
                            </button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setTermDialog({ mode: "create", stage, term: null })}>
                            <Plus />
                            {c.addReport}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openStageDialog({ mode: "edit", stage })}>
                            <Pencil />
                            {c.editStage}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              execute(() => setStageActive({ stageId: stage.id, active: !stage.active }))
                            }
                          >
                            <CircleDot />
                            {stage.active ? c.disableStage : c.enableStage}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleteTarget({ kind: "stage", id: stage.id, name: stage.name })}
                          >
                            <Trash2 />
                            {c.deleteStage}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded ? (
                  <CardContent className="!px-0 !pb-0">
                    {stage.terms.length === 0 ? (
                      <div className="flex flex-col items-center px-4 py-10 text-center">
                        <FileText className="size-7 text-muted-foreground" />
                        <p className="mt-2 text-sm text-muted-foreground">{c.noReports}</p>
                        <Button
                          className="mt-4"
                          variant="outline"
                          onClick={() => setTermDialog({ mode: "create", stage, term: null })}
                        >
                          <Plus data-icon="inline-start" />
                          {c.addReport}
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="hidden w-full overflow-hidden md:block">
                          <Table className="w-full table-fixed border-collapse">
                            <TermTableColumns />
                            <TableHeader>
                              <TableRow className="bg-muted/35 hover:bg-muted/35">
                                <TableHead className="h-9 px-3 text-start text-xs font-semibold">{c.reportName}</TableHead>
                                <TableHead className="h-9 px-3 text-start text-xs font-semibold">{c.requirement}</TableHead>
                                <TableHead className="h-9 px-3 text-start text-xs font-semibold">{c.approval}</TableHead>
                                <TableHead className="h-9 px-3 text-start text-xs font-semibold">{c.status}</TableHead>
                                <TableHead className="h-9 px-3 text-end text-xs font-semibold">{c.actions}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {stage.terms.map((term, termIndex) => (
                                <TableRow key={term.id} className={term.status === "disabled" ? "opacity-60" : undefined}>
                                  <TableCell className="px-3 py-2.5 align-middle font-medium whitespace-normal">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                                        {termIndex + 1}
                                      </span>
                                      <span className="min-w-0 break-words leading-5">{term.reportName}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="px-3 py-2.5 align-middle">
                                    <Badge
                                      variant={term.required ? "default" : "outline"}
                                      className="h-6 min-w-16 justify-center px-2 text-xs"
                                    >
                                      {term.required ? c.required : c.optional}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="px-3 py-2.5 align-middle">
                                    {term.approvalRequired ? (
                                      <Badge variant="outline" className="h-6 min-w-16 justify-center px-2 text-xs">
                                        {c.approvalRequired}
                                      </Badge>
                                    ) : (
                                      <span aria-hidden="true" className="inline-block h-6 min-w-16" />
                                    )}
                                  </TableCell>
                                  <TableCell className="px-3 py-2.5 align-middle">
                                    <Badge
                                      variant={term.status === "active" ? "secondary" : "outline"}
                                      className="h-6 min-w-16 justify-center px-2 text-xs"
                                    >
                                      {term.status === "active" ? c.active : c.disabled}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="px-3 py-2.5 text-end align-middle">
                                    <TermActions
                                      term={term}
                                      termIndex={termIndex}
                                      termCount={stage.terms.length}
                                      disabled={isPending}
                                      labels={c}
                                      onEdit={() => setTermDialog({ mode: "edit", stage, term })}
                                      onMove={(direction) =>
                                        execute(() => moveStageTerm({ termId: term.id, direction }))
                                      }
                                      onToggle={() =>
                                        execute(() =>
                                          setStageTermStatus({
                                            termId: term.id,
                                            status: term.status === "active" ? "disabled" : "active",
                                          }),
                                        )
                                      }
                                      onDelete={() =>
                                        setDeleteTarget({ kind: "term", id: term.id, name: term.reportName })
                                      }
                                    />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        <div className="divide-y md:hidden">
                          {stage.terms.map((term, termIndex) => (
                            <div key={term.id} className="space-y-3 px-4 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-start gap-2">
                                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                                    {termIndex + 1}
                                  </span>
                                  <p className="min-w-0 break-words font-medium leading-5">{term.reportName}</p>
                                </div>
                                <TermActions
                                  term={term}
                                  termIndex={termIndex}
                                  termCount={stage.terms.length}
                                  disabled={isPending}
                                  labels={c}
                                  onEdit={() => setTermDialog({ mode: "edit", stage, term })}
                                  onMove={(direction) =>
                                    execute(() => moveStageTerm({ termId: term.id, direction }))
                                  }
                                  onToggle={() =>
                                    execute(() =>
                                      setStageTermStatus({
                                        termId: term.id,
                                        status: term.status === "active" ? "disabled" : "active",
                                      }),
                                    )
                                  }
                                  onDelete={() =>
                                    setDeleteTarget({ kind: "term", id: term.id, name: term.reportName })
                                  }
                                />
                              </div>
                              <dl className="grid grid-cols-3 gap-2 text-sm">
                                <div className="min-w-0">
                                  <dt className="truncate text-[11px] text-muted-foreground">{c.requirement}</dt>
                                  <dd className="mt-1">
                                    <Badge variant={term.required ? "default" : "outline"} className="h-6 px-2 text-xs">
                                      {term.required ? c.required : c.optional}
                                    </Badge>
                                  </dd>
                                </div>
                                <div className="min-w-0">
                                  <dt className="truncate text-[11px] text-muted-foreground">{c.approval}</dt>
                                  <dd className="mt-1">
                                    {term.approvalRequired ? (
                                      <Badge variant="outline" className="h-6 px-2 text-xs">{c.approvalRequired}</Badge>
                                    ) : (
                                      <span aria-hidden="true" className="block h-6" />
                                    )}
                                  </dd>
                                </div>
                                <div className="min-w-0">
                                  <dt className="truncate text-[11px] text-muted-foreground">{c.status}</dt>
                                  <dd className="mt-1">
                                    <Badge variant={term.status === "active" ? "secondary" : "outline"} className="h-6 px-2 text-xs">
                                      {term.status === "active" ? c.active : c.disabled}
                                    </Badge>
                                  </dd>
                                </div>
                              </dl>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </CardContent>
                ) : null}
              </Card>
            )
          })}
        </div>
      )}

      {stageDialog ? (
        <StageEditorDialog
          key={`${stageDialog.mode}-${stageDialog.stage?.id ?? "new"}`}
          state={stageDialog}
          pending={stageSubmitting}
          labels={c}
          onClose={closeStageDialog}
          onSubmit={submitStage}
        />
      ) : null}

      <TermEditorDialog
        key={termDialog ? `${termDialog.mode}-${termDialog.term?.id ?? termDialog.stage.id}` : "closed"}
        state={termDialog}
        pending={isPending}
        labels={c}
        onClose={() => setTermDialog(null)}
        onSubmit={(values) => {
          if (!termDialog) return
          execute(
            () =>
              termDialog.mode === "create"
                ? createStageTerm({ stageId: termDialog.stage.id, ...values })
                : updateStageTerm({ termId: termDialog.term.id, ...values }),
            () => setTermDialog(null),
          )
        }}
      />

      <Dialog open={deleteTarget != null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{c.deleteTitle}</DialogTitle>
            <DialogDescription>
              {deleteTarget?.kind === "stage" ? c.deleteStageDescription : c.deleteTermDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm font-medium">{deleteTarget?.name}</div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => setDeleteTarget(null)}>
              {c.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending || !deleteTarget}
              onClick={() => {
                if (!deleteTarget) return
                execute(
                  () =>
                    deleteTarget.kind === "stage"
                      ? deleteStage({ stageId: deleteTarget.id })
                      : deleteStageTerm({ termId: deleteTarget.id }),
                  () => setDeleteTarget(null),
                )
              }}
            >
              <Trash2 data-icon="inline-start" />
              {c.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TermActions({
  term,
  termIndex,
  termCount,
  disabled,
  labels,
  onEdit,
  onMove,
  onToggle,
  onDelete,
}: {
  term: StageTermRecord
  termIndex: number
  termCount: number
  disabled: boolean
  labels: (typeof COPY)["en"] | (typeof COPY)["ar"]
  onEdit: () => void
  onMove: (direction: "up" | "down") => void
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={labels.actions}
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <MoreHorizontal className="size-4" />
          </button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={disabled || termIndex === 0} onClick={() => onMove("up")}>
          <ArrowUp />
          {labels.moveUp}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={disabled || termIndex === termCount - 1} onClick={() => onMove("down")}>
          <ArrowDown />
          {labels.moveDown}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onEdit}>
          <Pencil />
          {labels.editReport}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onToggle}>
          <CircleDot />
          {term.status === "active" ? labels.disableReport : labels.enableReport}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 />
          {labels.deleteReport}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function StageEditorDialog({
  state,
  pending,
  labels,
  onClose,
  onSubmit,
}: {
  state: StageDialogState
  pending: boolean
  labels: (typeof COPY)["en"] | (typeof COPY)["ar"]
  onClose: () => void
  onSubmit: (values: { name: string; description: string }) => void
}) {
  const formRef = useRef<HTMLFormElement>(null)

  function closeDialog() {
    formRef.current?.reset()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent showCloseButton={false}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={labels.cancel}
          className="absolute right-2 top-2"
          onClick={closeDialog}
        >
          <X className="size-4" />
        </Button>
        <form
          ref={formRef}
          onSubmit={(event) => {
            event.preventDefault()
            if (pending) return
            const form = new FormData(event.currentTarget)
            onSubmit({
              name: String(form.get("name") ?? ""),
              description: String(form.get("description") ?? ""),
            })
          }}
          className="contents"
        >
          <DialogHeader>
            <DialogTitle>{state.mode === "edit" ? labels.editStageTitle : labels.createStageTitle}</DialogTitle>
            <DialogDescription>{labels.stageDialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="stage-name">{labels.stageName}</Label>
              <Input
                id="stage-name"
                name="name"
                required
                minLength={2}
                autoFocus
                defaultValue={state.stage?.name ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stage-description">{labels.description}</Label>
              <textarea
                id="stage-description"
                name="description"
                rows={4}
                defaultValue={state.stage?.description ?? ""}
                placeholder={labels.descriptionPlaceholder}
                className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              {labels.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {state.mode === "edit" ? labels.save : labels.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type TermFormValues = {
  reportName: string
  required: boolean
  approvalRequired: boolean
  status: StageTermStatus
}

function TermEditorDialog({
  state,
  pending,
  labels,
  onClose,
  onSubmit,
}: {
  state: TermDialogState | null
  pending: boolean
  labels: (typeof COPY)["en"] | (typeof COPY)["ar"]
  onClose: () => void
  onSubmit: (values: TermFormValues) => void
}) {
  const initial = state?.term
  const [required, setRequired] = useState(initial?.required ?? true)
  const [approvalRequired, setApprovalRequired] = useState(initial?.approvalRequired ?? false)
  const [status, setStatus] = useState<StageTermStatus>(initial?.status ?? "active")

  return (
    <Dialog open={state != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[32rem]">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            onSubmit({
              reportName: String(form.get("reportName") ?? ""),
              required,
              approvalRequired,
              status,
            })
          }}
          className="contents"
        >
          <DialogHeader>
            <DialogTitle>{state?.mode === "edit" ? labels.editReportTitle : labels.addReportTitle}</DialogTitle>
            <DialogDescription>
              {state?.stage.name} — {labels.termDialogDescription}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="term-report-name">{labels.reportName}</Label>
              <Input
                id="term-report-name"
                name="reportName"
                required
                minLength={2}
                autoFocus
                defaultValue={initial?.reportName ?? ""}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>{labels.status}</Label>
              <Select value={status} onValueChange={(value) => setStatus((value as StageTermStatus | null) ?? "active")}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(value) => (value === "active" ? labels.active : labels.disabled)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{labels.active}</SelectItem>
                  <SelectItem value="disabled">{labels.disabled}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex min-h-20 items-center justify-between gap-4 rounded-xl border p-3">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <Label htmlFor="term-required" className="cursor-pointer">
                    {labels.requiredToggle}
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {required ? labels.required : labels.optional}
                  </p>
                </div>
              </div>
              <Switch id="term-required" checked={required} onCheckedChange={setRequired} />
            </div>

            <div className="flex min-h-20 items-center justify-between gap-4 rounded-xl border p-3">
              <div className="flex min-w-0 items-center gap-2">
                <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
                <Label htmlFor="term-approval" className="cursor-pointer">
                  {labels.approvalToggle}
                </Label>
              </div>
              <Switch id="term-approval" checked={approvalRequired} onCheckedChange={setApprovalRequired} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              {labels.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {state?.mode === "edit" ? labels.save : labels.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
