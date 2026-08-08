"use client"

import Link from "next/link"
import { useState } from "react"
import {
  ChevronDown,
  Download,
  Eye,
  FileArchive,
  FileCheck2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  MoreVertical,
  Pencil,
} from "lucide-react"
import { CreateDocumentDialog } from "@/components/documents/create-document-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getDocumentTypeDefinition, type DocumentTypeIconKey, type DocumentTypeValue } from "@/lib/documents/document-types"
import { cn } from "@/lib/utils"
import { ProjectOverviewTableColumns, projectOverviewTableCellClass } from "@/components/projects/project-overview-table-columns"
import { profileAvatarDisplayUrl } from "@/lib/profile-avatar"

export type ProjectDocument = {
  id: string
  reference: string
  title: string
  type: DocumentTypeValue
  uploadedBy: {
    name: string
    initials: string
    avatar?: string
  }
  lastUpdated: string
  status: "Approved" | "Current" | "Under Review" | "Updated" | "Shared" | "Published" | "Draft"
  fileStoragePath?: string | null
  originalFilename?: string | null
}

const statusStyles: Record<ProjectDocument["status"], string> = {
  Approved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  Current: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  "Under Review": "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  Updated: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300",
  Shared: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
  Published: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  Draft: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
}

function DocumentIcon({ type }: { type: ProjectDocument["type"] }) {
  const icon = getDocumentTypeDefinition(type).icon
  const icons: Record<DocumentTypeIconKey, typeof FileText> = {
    inspection: FileCheck2,
    quality: FileCheck2,
    safety: FileCheck2,
    report: FileSpreadsheet,
    drawing: FileImage,
    submittal: FileArchive,
    commercial: FileCheck2,
    communication: FileText,
    document: FileText,
  }
  const Icon = icons[icon]

  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary" aria-hidden="true">
      <Icon className="size-4" />
    </span>
  )
}

export function ProjectDocuments({
  projectId,
  documents,
  memberMobile = false,
}: {
  projectId: string
  documents: ProjectDocument[]
  memberMobile?: boolean
}) {
  const projectQuery = encodeURIComponent(projectId)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <Card className="gap-0 py-0">
      <CardHeader className={cn("gap-3 border-b px-5 py-4 sm:px-6 md:grid-cols-[1fr_auto] md:items-center", memberMobile && "max-md:px-3 max-md:py-2.5")}>
        {memberMobile ? (
          <button
            type="button"
            className="flex w-full min-w-0 items-center gap-2 text-start md:hidden"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
          >
            <FileText className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 text-sm font-semibold">Project Letters ({documents.length})</span>
            <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", mobileOpen && "rotate-180")} />
          </button>
        ) : null}
        <CardTitle className={cn("flex items-center gap-2 text-base font-semibold sm:text-lg", memberMobile && "max-md:hidden")}>
          <FileText className="size-5 text-primary" />
          5. Project Letters
        </CardTitle>
        <div className={cn("flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end", memberMobile && "max-md:hidden")}>
          <CreateDocumentDialog
            projectId={projectId}
            triggerLabel="Create Letter"
            triggerClassName="h-9 w-full sm:w-auto"
          />
          <Link
            href={`/documents?project=${projectQuery}`}
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-9 w-full sm:w-auto")}
          >
            <FolderOpen className="size-4" />
            View All Letters
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {memberMobile && mobileOpen ? (
          <div className="border-b px-3 py-2.5 md:hidden">
            <div className="flex gap-2">
              <CreateDocumentDialog
                projectId={projectId}
                triggerLabel="Create Letter"
                triggerClassName="h-8 flex-1 text-xs"
              />
              <Link
                href={`/documents?project=${projectQuery}`}
                className={cn(buttonVariants({ variant: "outline" }), "h-8 flex-1 justify-center px-2 text-xs")}
              >
                <FolderOpen className="size-3.5" />
                View All Letters
              </Link>
            </div>
          </div>
        ) : null}
        <div className={cn("overflow-x-auto", memberMobile && "max-md:hidden")}>
          <table className="w-full min-w-[900px] table-fixed text-sm">
            <ProjectOverviewTableColumns layout="letters" />
            <thead>
              <tr className="border-b bg-muted/45 text-xs font-semibold text-muted-foreground">
                <th className={projectOverviewTableCellClass.headerFirst}>Reference</th>
                <th className={projectOverviewTableCellClass.headerMiddle}>Title</th>
                <th className={projectOverviewTableCellClass.headerMiddle}>Type</th>
                <th className={projectOverviewTableCellClass.headerMiddle}>Uploaded By</th>
                <th className={projectOverviewTableCellClass.headerMiddle}>Last Updated</th>
                <th className={projectOverviewTableCellClass.headerMiddle}>Status</th>
                <th className={projectOverviewTableCellClass.headerLast}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {documents.map((document) => (
                <tr key={document.id} className="transition-colors hover:bg-muted/30">
                  <td className={projectOverviewTableCellClass.bodyFirst}>
                    <Link
                      href={`/documents/${document.id}`}
                      className="block truncate font-medium text-primary hover:underline"
                      title={document.reference}
                    >
                      {document.reference}
                    </Link>
                  </td>
                  <td className={projectOverviewTableCellClass.bodyMiddle}>
                    <div className="flex min-w-0 items-center gap-3">
                      <DocumentIcon type={document.type} />
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground" title={document.title}>{document.title}</span>
                    </div>
                  </td>
                  <td className={projectOverviewTableCellClass.bodyMiddle}>
                    <span
                      title={getDocumentTypeDefinition(document.type).label}
                      className={cn("inline-flex rounded-md px-2.5 py-1 text-xs font-medium", getDocumentTypeDefinition(document.type).badgeClassName)}
                    >
                      {getDocumentTypeDefinition(document.type).shortLabel}
                    </span>
                  </td>
                  <td className={projectOverviewTableCellClass.bodyMiddle}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar size="sm">
                        {document.uploadedBy.avatar ? (
                          <AvatarImage src={profileAvatarDisplayUrl(document.uploadedBy.avatar)} alt={document.uploadedBy.name} />
                        ) : null}
                        <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                          {document.uploadedBy.initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1 truncate font-medium" title={document.uploadedBy.name}>{document.uploadedBy.name}</span>
                    </div>
                  </td>
                  <td className={cn(projectOverviewTableCellClass.bodyMiddle, "whitespace-nowrap text-muted-foreground")}>{document.lastUpdated}</td>
                  <td className={projectOverviewTableCellClass.bodyMiddle}>
                    <span className={cn("inline-flex rounded-md px-2.5 py-1 text-xs font-medium", statusStyles[document.status])}>
                      {document.status}
                    </span>
                  </td>
                  <td className={projectOverviewTableCellClass.bodyLast}>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <button
                            type="button"
                            aria-label={`Actions for ${document.title}`}
                            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <MoreVertical className="size-4" />
                          </button>
                        }
                      />
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          render={
                            <Link href={`/documents/${document.id}`}>
                              <Eye className="size-4" />
                              View letter
                            </Link>
                          }
                        />
                        {document.fileStoragePath ? (
                          <DropdownMenuItem
                            render={
                              <a href={`/api/document-files?path=${encodeURIComponent(document.fileStoragePath)}&download=1&filename=${encodeURIComponent(document.originalFilename ?? document.title)}`}>
                                <Download className="size-4" />
                                Download
                              </a>
                            }
                          />
                        ) : null}
                        {!document.fileStoragePath ? (
                          <DropdownMenuItem
                            render={
                              <Link href={`/documents/${document.id}/edit`}>
                                <Pencil className="size-4" />
                                Edit letter
                              </Link>
                            }
                          />
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {memberMobile ? (
          <div className={cn("divide-y divide-border md:hidden", !mobileOpen && "hidden")}>
            {documents.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">No project letters are available.</p>
            ) : (
              documents.map((document) => (
                <article key={document.id} className="flex min-w-0 items-start gap-2.5 px-3 py-2.5">
                  <DocumentIcon type={document.type} />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/documents/${document.id}`}
                          className="block truncate text-xs font-semibold text-primary hover:underline"
                          title={document.reference}
                        >
                          {document.reference}
                        </Link>
                        <Link
                          href={`/documents/${document.id}`}
                          className="mt-0.5 block truncate text-sm font-semibold text-foreground hover:underline"
                          title={document.title}
                        >
                          {document.title}
                        </Link>
                      </div>
                      <span className={cn("inline-flex shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium", statusStyles[document.status])}>
                        {document.status}
                      </span>
                    </div>
                    <div className="mt-1.5 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                      <span className={cn("inline-flex shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium", getDocumentTypeDefinition(document.type).badgeClassName)}>
                        {getDocumentTypeDefinition(document.type).shortLabel}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{document.uploadedBy.name} • {document.lastUpdated}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <button
                              type="button"
                              aria-label={`Actions for ${document.title}`}
                              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              <MoreVertical className="size-4" />
                            </button>
                          }
                        />
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            render={
                              <Link href={`/documents/${document.id}`}>
                                <Eye className="size-4" />
                                View letter
                              </Link>
                            }
                          />
                          {document.fileStoragePath ? (
                            <DropdownMenuItem
                              render={
                                <a href={`/api/document-files?path=${encodeURIComponent(document.fileStoragePath)}&download=1&filename=${encodeURIComponent(document.originalFilename ?? document.title)}`}>
                                  <Download className="size-4" />
                                  Download
                                </a>
                              }
                            />
                          ) : null}
                          {!document.fileStoragePath ? (
                            <DropdownMenuItem
                              render={
                                <Link href={`/documents/${document.id}/edit`}>
                                  <Pencil className="size-4" />
                                  Edit letter
                                </Link>
                              }
                            />
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
