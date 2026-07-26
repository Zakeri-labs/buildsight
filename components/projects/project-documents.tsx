"use client"

import Link from "next/link"
import {
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
  Upload,
} from "lucide-react"
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
  status: "Approved" | "Current" | "Under Review" | "Updated" | "Shared"
}

const statusStyles: Record<ProjectDocument["status"], string> = {
  Approved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  Current: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  "Under Review": "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  Updated: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300",
  Shared: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
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

export function ProjectDocuments({ projectId, documents }: { projectId: string; documents: ProjectDocument[] }) {
  const projectQuery = encodeURIComponent(projectId)

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="gap-3 border-b px-5 py-4 sm:px-6 md:grid-cols-[1fr_auto] md:items-center">
        <CardTitle className="flex items-center gap-2 text-base font-semibold sm:text-lg">
          <FileText className="size-5 text-primary" />
          3. Core Project Documents
        </CardTitle>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/documents/new"
            className={cn(buttonVariants({ size: "lg" }), "h-9 w-full sm:w-auto")}
          >
            <Upload className="size-4" />
            Upload Document
          </Link>
          <Link
            href={`/documents?project=${projectQuery}`}
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-9 w-full sm:w-auto")}
          >
            <FolderOpen className="size-4" />
            View All Documents
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/45 text-xs font-semibold text-muted-foreground">
                <th className="px-5 py-3 text-start sm:px-6">Reference</th>
                <th className="px-4 py-3 text-start">Title</th>
                <th className="px-4 py-3 text-start">Type</th>
                <th className="px-4 py-3 text-start">Uploaded By</th>
                <th className="px-4 py-3 text-start">Last Updated</th>
                <th className="px-4 py-3 text-start">Status</th>
                <th className="px-5 py-3 text-end sm:px-6">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {documents.map((document) => (
                <tr key={document.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-5 py-3.5 sm:px-6">
                    <Link
                      href={`/documents?project=${projectQuery}&document=${encodeURIComponent(document.id)}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {document.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <DocumentIcon type={document.type} />
                      <span className="font-medium text-foreground">{document.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      title={getDocumentTypeDefinition(document.type).label}
                      className={cn("inline-flex rounded-md px-2.5 py-1 text-xs font-medium", getDocumentTypeDefinition(document.type).badgeClassName)}
                    >
                      {getDocumentTypeDefinition(document.type).shortLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar size="sm">
                        {document.uploadedBy.avatar ? (
                          <AvatarImage src={document.uploadedBy.avatar} alt={document.uploadedBy.name} />
                        ) : null}
                        <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                          {document.uploadedBy.initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{document.uploadedBy.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground">{document.lastUpdated}</td>
                  <td className="px-4 py-3.5">
                    <span className={cn("inline-flex rounded-md px-2.5 py-1 text-xs font-medium", statusStyles[document.status])}>
                      {document.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-end sm:px-6">
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
                            <Link href={`/documents?project=${projectQuery}&document=${encodeURIComponent(document.id)}`}>
                              <Eye className="size-4" />
                              View document
                            </Link>
                          }
                        />
                        <DropdownMenuItem>
                          <Download className="size-4" />
                          Download
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          render={
                            <Link href={`/documents?project=${projectQuery}&document=${encodeURIComponent(document.id)}&action=edit`}>
                              <Pencil className="size-4" />
                              Edit details
                            </Link>
                          }
                        />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
