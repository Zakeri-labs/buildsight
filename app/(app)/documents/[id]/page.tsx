import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CalendarDays, CheckCircle2, FileText, FolderLock, Pencil } from "lucide-react"
import { RichTextRenderer } from "@/components/documents/rich-text-renderer"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requireOnboarded } from "@/lib/auth/session"
import { getDocumentTypeDefinition } from "@/lib/documents/document-types"
import { isRichTextDocument, EMPTY_RICH_TEXT_DOCUMENT } from "@/lib/documents/rich-text"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

function initials(name: string) {
  return name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U"
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date)
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
    .select("id, project_id, reference, title, document_type, status, content, created_by, published_at, created_at, updated_at")
    .eq("id", id)
    .maybeSingle()

  if (!document) notFound()

  const [{ data: project }, { data: creator }] = await Promise.all([
    supabase.from("projects").select("id, name").eq("id", document.project_id).maybeSingle(),
    supabase.from("profiles").select("full_name, email, avatar_url").eq("id", document.created_by).maybeSingle(),
  ])

  const creatorName = creator?.full_name?.trim() || creator?.email || (document.created_by === session.userId ? session.email : "Project member")
  const content = isRichTextDocument(document.content) ? document.content : EMPTY_RICH_TEXT_DOCUMENT
  const documentType = getDocumentTypeDefinition(document.document_type)
  const savedState = query.updated ?? query.created
  const wasUpdated = Boolean(query.updated)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/documents" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" />
          Back to Documents
        </Link>
        <Link href={`/documents/${document.id}/edit`} className={cn(buttonVariants({ variant: "outline" }), "bg-background")}>
          <Pencil className="size-4" />
          Edit Document
        </Link>
      </div>

      {savedState === "draft" || savedState === "published" ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <CheckCircle2 className="size-5 shrink-0" />
          {wasUpdated
            ? savedState === "published" ? "Document updated and published successfully." : "Draft updated successfully."
            : savedState === "published" ? "Document published successfully." : "Draft saved successfully."}
        </div>
      ) : null}

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b bg-linear-to-r from-blue-950 to-slate-900 px-6 py-6 text-white">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-blue-200">
                <span>{document.reference}</span>
                <span aria-hidden="true">•</span>
                <span>{documentType.label}</span>
              </div>
              <CardTitle className="text-2xl font-bold leading-tight text-white sm:text-3xl">{document.title}</CardTitle>
              <p className="mt-2 flex items-center gap-2 text-sm text-blue-100/90">
                <FolderLock className="size-4" />
                Saved under {project?.name ?? "Project"}
              </p>
            </div>
            <span className={cn("inline-flex w-fit rounded-full px-3 py-1.5 text-xs font-semibold", document.status === "published" ? "bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-300/25" : "bg-amber-400/15 text-amber-200 ring-1 ring-amber-300/25")}>{document.status === "published" ? "Published" : "Draft"}</span>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 border-b bg-muted/25 px-6 py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-9">
              {creator?.avatar_url ? <AvatarImage src={creator.avatar_url} alt={creatorName} /> : null}
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(creatorName)}</AvatarFallback>
            </Avatar>
            <div><span className="block text-xs text-muted-foreground">Created by</span><span className="font-medium">{creatorName}</span></div>
          </div>
          <div className="flex items-center gap-3">
            <CalendarDays className="size-5 text-muted-foreground" />
            <div><span className="block text-xs text-muted-foreground">Last updated</span><span className="font-medium">{formatDate(document.updated_at)}</span></div>
          </div>
          <div className="flex items-center gap-3">
            <FileText className="size-5 text-muted-foreground" />
            <div><span className="block text-xs text-muted-foreground">Document type</span><span className="font-medium">{documentType.label}</span></div>
          </div>
          <div className="flex items-center gap-3">
            <FolderLock className="size-5 text-muted-foreground" />
            <div><span className="block text-xs text-muted-foreground">Project</span><span className="font-medium">{project?.name ?? "Project"}</span></div>
          </div>
        </CardContent>
        <CardContent className="bg-white px-6 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-10 lg:px-16">
          <RichTextRenderer document={content} />
        </CardContent>
      </Card>
    </div>
  )
}
