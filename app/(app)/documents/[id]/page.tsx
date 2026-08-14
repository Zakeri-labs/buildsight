import type { ReactNode } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  FolderLock,
  HardDrive,
  Pencil,
  UserRound,
} from "lucide-react"
import {
  ConstructionDocumentWorkspace,
  type DocumentAttachmentView,
} from "@/components/documents/construction-document-workspace"
import { RichTextRenderer } from "@/components/documents/rich-text-renderer"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requireOnboarded } from "@/lib/auth/session"
import { getConstructionDocumentType, getDocumentDetailsTemplate } from "@/lib/documents/construction-document-types"
import { getDocumentTypeDefinition } from "@/lib/documents/document-types"
import { isRichTextDocument, richTextHasContent, EMPTY_RICH_TEXT_DOCUMENT } from "@/lib/documents/rich-text"
import { formatFileSize, getSimpleUploadCategory } from "@/lib/documents/simple-upload"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

function initials(name: string) {
  return name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U"
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "long", year: "numeric" }).format(date)
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date)
}

function workflowStatusLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    open: "Open",
    under_review: "Under Review",
    answered: "Answered",
    approved: "Approved",
    rejected: "Rejected",
    closed: "Closed",
  }
  return labels[status ?? ""] ?? "Open"
}

export default async function DocumentDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ created?: string; updated?: string }>
}) {
  const session = await requireOnboarded()
  const [{ id }, query] = await Promise.all([params, searchParams])
  const supabase = await createClient()

  const { data: document } = await supabase
    .from("documents")
    .select("id, project_id, reference, title, document_type, status, workflow_status, short_description, document_details, content, created_by, published_at, created_at, updated_at, creation_mode, simple_upload_category, file_storage_path, original_filename, file_mime_type, file_size_bytes")
    .eq("id", id)
    .maybeSingle()

  if (!document) notFound()

  const [{ data: project }, { data: creator }, { data: attachmentRows }] = await Promise.all([
    supabase.from("projects").select("id, name").eq("id", document.project_id).maybeSingle(),
    supabase.from("profiles").select("full_name, email, avatar_url").eq("id", document.created_by).maybeSingle(),
    supabase
      .from("document_attachments")
      .select("id, attachment_type, storage_path, original_filename, mime_type, size_bytes, created_at")
      .eq("document_id", document.id)
      .order("created_at", { ascending: false }),
  ])

  const creatorName = creator?.full_name?.trim() || creator?.email || (document.created_by === session.userId ? session.email : "Project member")
  const content = isRichTextDocument(document.content) ? document.content : EMPTY_RICH_TEXT_DOCUMENT
  const documentType = getDocumentTypeDefinition(document.document_type)
  const constructionType = getConstructionDocumentType(document.document_type)
  const simpleCategory = getSimpleUploadCategory(document.simple_upload_category)
  const displayType = simpleCategory?.label ?? constructionType?.label ?? documentType.label
  const savedState = query.updated ?? query.created
  const isFileDocument = document.creation_mode === "simple" && Boolean(document.file_storage_path)
  const fileUrl = document.file_storage_path
    ? `/api/document-files?path=${encodeURIComponent(document.file_storage_path)}&filename=${encodeURIComponent(document.original_filename ?? document.title)}`
    : null
  const downloadUrl = fileUrl ? `${fileUrl}&download=1` : null
  const wasUpdated = Boolean(query.updated)
  const attachments: DocumentAttachmentView[] = (attachmentRows ?? []).map((attachment: any) => ({
    id: attachment.id,
    attachmentType: attachment.attachment_type === "image" ? "image" : "file",
    storagePath: attachment.storage_path,
    originalFilename: attachment.original_filename,
    mimeType: attachment.mime_type,
    sizeBytes: Number(attachment.size_bytes),
    createdAt: attachment.created_at,
  }))
  const hasRealDescription = Boolean(
    document.short_description?.trim() &&
    document.short_description.trim() !== "No short description provided."
  )

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/documents?project=${encodeURIComponent(document.project_id)}`} className="inline-flex w-fit items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:text-sm">
          <ArrowLeft className="size-4" />
          Back to Letters
        </Link>
        <div className="flex items-center gap-2">
          {isFileDocument && downloadUrl ? (
            <a href={downloadUrl} className={cn(buttonVariants({ variant: "outline" }), "bg-background")}>
              <Download className="size-4" />
              Download File
            </a>
          ) : document.status === "draft" ? (
            <Link href={`/documents/${document.id}/edit`} className={cn(buttonVariants({ variant: "outline" }), "bg-background")}>
              <Pencil className="size-4" />
              Edit Letter
            </Link>
          ) : null}
        </div>
      </div>

      {savedState ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 sm:px-4 sm:text-sm">
          <CheckCircle2 className="size-5 shrink-0" />
          {query.created === "construction"
            ? "Letter created successfully. Complete the details and add attachments below."
            : wasUpdated
              ? savedState === "published" ? "Letter updated and published successfully." : "Draft updated successfully."
              : savedState === "published" ? "Letter published successfully." : "Draft saved successfully."}
        </div>
      ) : null}

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b bg-linear-to-r from-blue-950 to-slate-900 px-4 py-5 text-white sm:px-6 sm:py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-blue-200">
                <span>{document.reference}</span>
                <span aria-hidden="true">•</span>
                <span>{displayType}</span>
              </div>
              <CardTitle className="text-xl font-bold leading-tight text-white sm:text-3xl">{document.title}</CardTitle>
              <p className="mt-2.5 flex items-center gap-2 text-xs text-blue-100/90 sm:mt-3 sm:text-sm">
                <CalendarDays className="size-3.5 sm:size-4" />
                Created {formatDate(document.created_at)}
              </p>
            </div>
            <span className="inline-flex w-fit rounded-full bg-emerald-400/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-300/25">
              {workflowStatusLabel(document.workflow_status)}
            </span>
          </div>
        </CardHeader>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-3.5 py-3 sm:px-6 sm:py-4">
          <CardTitle className="text-base font-bold sm:text-lg">Letter Information</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3.5 px-3.5 py-3.5 sm:grid sm:grid-cols-2 sm:gap-x-8 sm:gap-y-5 sm:px-6 sm:py-5 lg:grid-cols-3">
          <InformationItem label="Letter Type" value={displayType} icon={<FileText className="size-4" />} />
          <InformationItem label="Letter Reference" value={document.reference} icon={<FolderLock className="size-4" />} />
          <InformationItem label="Letter Title" value={document.title} icon={<FileText className="size-4" />} />
          {hasRealDescription ? (
            <InformationItem label="Description" value={document.short_description!.trim()} icon={<FileText className="size-4" />} />
          ) : (
            <InformationItem label="Description" value="No short description provided." icon={<FileText className="size-4" />} className="hidden sm:flex" />
          )}
          <div className="flex items-start gap-3">
            <Avatar className="mt-0.5 size-8 shrink-0 sm:size-9">
              {creator?.avatar_url ? <AvatarImage src={creator.avatar_url} alt={creatorName} /> : null}
              <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary sm:text-xs">{initials(creatorName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <span className="block text-[11px] font-medium text-muted-foreground sm:text-xs">Created By</span>
              <span className="mt-0.5 block break-words text-xs font-semibold text-foreground sm:mt-1 sm:text-sm sm:font-medium">{creatorName}</span>
            </div>
          </div>
          <InformationItem label="Created Date" value={formatDateTime(document.created_at)} icon={<CalendarDays className="size-4" />} />
        </CardContent>
      </Card>

      <ConstructionDocumentWorkspace
        documentId={document.id}
        projectId={document.project_id}
        initialDetails={document.document_details ?? (constructionType ? getDocumentDetailsTemplate(constructionType.value) : "")}
        attachments={attachments}
      />

      {isFileDocument && fileUrl ? (
        <Card className="gap-0 py-0">
          <CardHeader className="border-b px-5 py-4 sm:px-6"><CardTitle className="text-lg">Original Uploaded File</CardTitle></CardHeader>
          <CardContent className="px-6 py-8">
            <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 rounded-2xl border border-dashed bg-muted/20 px-6 py-10 text-center">
              <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><HardDrive className="size-8" /></span>
              <div>
                <h2 className="text-xl font-semibold">{document.original_filename ?? document.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {simpleCategory?.label ?? "Uploaded letter"}
                  {document.file_size_bytes ? ` · ${formatFileSize(Number(document.file_size_bytes))}` : ""}
                  {document.file_mime_type ? ` · ${document.file_mime_type}` : ""}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <a href={fileUrl} target="_blank" rel="noreferrer" className={cn(buttonVariants(), "min-w-36")}><ExternalLink className="size-4" />View File</a>
                {downloadUrl ? <a href={downloadUrl} className={cn(buttonVariants({ variant: "outline" }), "min-w-36")}><Download className="size-4" />Download</a> : null}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!isFileDocument && richTextHasContent(content) ? (
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b px-5 py-4 sm:px-6"><CardTitle className="text-lg">Letter Content</CardTitle></CardHeader>
          <CardContent className="bg-white px-6 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-10 lg:px-16">
            <RichTextRenderer document={content} />
          </CardContent>
        </Card>
      ) : null}

      <p className="flex items-center justify-center gap-2 pb-2 text-xs text-muted-foreground">
        <UserRound className="size-3.5" />
        Saved under {project?.name ?? "Project"}
      </p>
    </div>
  )
}

function InformationItem({ label, value, icon, className }: { label: string; value: string; icon: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground sm:size-9 sm:rounded-lg">{icon}</span>
      <div className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium text-muted-foreground sm:text-xs">{label}</span>
        <span className="mt-0.5 block whitespace-pre-wrap break-words text-xs font-semibold text-foreground sm:mt-1 sm:text-sm sm:font-medium">{value}</span>
      </div>
    </div>
  )
}
