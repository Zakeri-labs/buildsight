"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
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
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react"
import { CreateDocumentDialog } from "@/components/documents/create-document-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getDocumentTypeDefinition, type DocumentTypeIconKey, type DocumentTypeValue } from "@/lib/documents/document-types"
import { cn } from "@/lib/utils"
import { ProjectOverviewTableColumns, projectOverviewTableCellClass } from "@/components/projects/project-overview-table-columns"
import { profileAvatarDisplayUrl } from "@/lib/profile-avatar"
import { useCurrentUser } from "@/components/current-user-provider"
import { deleteProjectDocumentAction } from "@/lib/actions/documents"

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

const HOLD_DURATION_MS = 400

function HoldToDeleteDocumentItem({
  document,
  onHoldComplete,
}: {
  document: ProjectDocument
  onHoldComplete: (doc: ProjectDocument) => void
}) {
  const [progress, setProgress] = useState(0)
  const [isHolding, setIsHolding] = useState(false)
  const animFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const completedRef = useRef(false)
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null)

  const resetHold = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    startTimeRef.current = null
    setIsHolding(false)
    setProgress(0)
    completedRef.current = false
  }, [])

  const startHold = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current)
    }
    completedRef.current = false
    setIsHolding(true)
    setProgress(0)
    const startTime = performance.now()
    startTimeRef.current = startTime

    const step = (now: number) => {
      const elapsed = now - startTime
      const currentProgress = Math.min(Math.max(elapsed / HOLD_DURATION_MS, 0), 1)
      setProgress(currentProgress)

      if (elapsed >= HOLD_DURATION_MS) {
        completedRef.current = true
        setIsHolding(false)
        setProgress(1)
        animFrameRef.current = null
        onHoldComplete(document)
      } else {
        animFrameRef.current = requestAnimationFrame(step)
      }
    }

    animFrameRef.current = requestAnimationFrame(step)
  }, [document, onHoldComplete])

  useEffect(() => {
    const handleBlur = () => resetHold()
    const handleVisibilityChange = () => {
      if (window.document.hidden) resetHold()
    }

    window.addEventListener("blur", handleBlur)
    window.document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      resetHold()
      window.removeEventListener("blur", handleBlur)
      window.document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [resetHold])

  const radius = 8
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference * (1 - progress)

  return (
    <DropdownMenuItem
      variant="destructive"
      closeOnClick={false}
      className={cn(
        "cursor-pointer select-none gap-2 py-1.5 focus:bg-destructive/10 dark:focus:bg-destructive/20",
        isHolding && "bg-destructive/15 text-destructive font-medium",
      )}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        startHold()
      }}
      onPointerUp={() => {
        if (!completedRef.current) {
          resetHold()
        }
      }}
      onPointerLeave={() => {
        if (!completedRef.current) {
          resetHold()
        }
      }}
      onPointerCancel={() => {
        resetHold()
      }}
      onTouchStart={(e) => {
        const touch = e.touches[0]
        if (touch) {
          touchStartPosRef.current = { x: touch.clientX, y: touch.clientY }
        }
      }}
      onTouchMove={(e) => {
        const touch = e.touches[0]
        if (touch && touchStartPosRef.current) {
          const dx = Math.abs(touch.clientX - touchStartPosRef.current.x)
          const dy = Math.abs(touch.clientY - touchStartPosRef.current.y)
          if (dx > 6 || dy > 6) {
            resetHold()
          }
        }
      }}
      onTouchEnd={() => {
        touchStartPosRef.current = null
        if (!completedRef.current) {
          resetHold()
        }
      }}
      onTouchCancel={() => {
        touchStartPosRef.current = null
        resetHold()
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          if (!e.repeat && !isHolding) {
            startHold()
          }
        }
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          if (!completedRef.current) {
            resetHold()
          }
        }
      }}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      aria-label={`Delete ${document.title} (press and hold for 400 ms)`}
      title="Press and hold for 400 ms"
    >
      <div className="relative flex size-5 shrink-0 items-center justify-center">
        <svg
          className={cn(
            "absolute inset-0 size-5 -rotate-90 pointer-events-none transition-opacity duration-150",
            isHolding || progress > 0 ? "opacity-100" : "opacity-0",
          )}
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <circle
            cx="10"
            cy="10"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-destructive/25"
          />
          <circle
            cx="10"
            cy="10"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="text-destructive"
          />
        </svg>
        <Trash2 className={cn("size-3.5 text-destructive transition-transform duration-100", isHolding && "scale-90")} />
      </div>
      <div className="flex min-w-0 flex-1 items-baseline justify-between gap-1.5">
        <span className="truncate text-xs font-medium text-destructive">
          {isHolding ? "Holding..." : "Delete document"}
        </span>
        <span className="text-[10px] text-destructive/70 shrink-0 font-mono">
          {isHolding ? `${Math.round(progress * 100)}%` : "Hold 400ms"}
        </span>
      </div>
    </DropdownMenuItem>
  )
}

export function ProjectDocuments({
  projectId,
  documents,
  memberMobile = false,
  canDeleteDocument = false,
}: {
  projectId: string
  documents: ProjectDocument[]
  memberMobile?: boolean
  canDeleteDocument?: boolean
}) {
  const router = useRouter()
  const currentUser = useCurrentUser()
  const isActualAdmin = Boolean(canDeleteDocument || currentUser?.role === "org_admin")

  const [items, setItems] = useState<ProjectDocument[]>(documents)
  useEffect(() => {
    setItems(documents)
  }, [documents])

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [documentToDelete, setDocumentToDelete] = useState<ProjectDocument | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleHoldComplete = useCallback((doc: ProjectDocument) => {
    setDocumentToDelete(doc)
    setDeleteError(null)
    setDeleteDialogOpen(true)
  }, [])

  const handleConfirmDelete = async () => {
    if (!documentToDelete || isDeleting) return
    setIsDeleting(true)
    setDeleteError(null)

    try {
      const res = await deleteProjectDocumentAction({
        documentId: documentToDelete.id,
        projectId,
      })

      if (!res.ok) {
        setDeleteError(res.error || "Failed to delete document.")
        setIsDeleting(false)
        return
      }

      setItems((prev) => prev.filter((d) => d.id !== documentToDelete.id))
      setDeleteDialogOpen(false)
      setDocumentToDelete(null)
      setIsDeleting(false)
      router.refresh()
    } catch (err) {
      setIsDeleting(false)
      setDeleteError(err instanceof Error ? err.message : "An unexpected error occurred while deleting the document.")
    }
  }

  const projectQuery = encodeURIComponent(projectId)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
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
              <span className="min-w-0 flex-1 text-sm font-semibold">Project Letters ({items.length})</span>
              <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", mobileOpen && "rotate-180")} />
            </button>
          ) : null}
          <CardTitle className={cn("flex items-center gap-2 text-base font-semibold sm:text-lg", memberMobile && "max-md:hidden")}>
            <FileText className="size-5 text-primary" />
            5. Project Letters
          </CardTitle>
          <div className={cn("flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end", memberMobile && "max-md:hidden")}>
            <Link
              href={`/documents/new?project=${projectQuery}`}
              className={cn(buttonVariants({ variant: "default" }), "h-9 w-full bg-blue-600 font-semibold text-white hover:bg-blue-700 sm:w-auto")}
            >
              <FileText className="size-4" />
              Create Letter
            </Link>
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
                <Link
                  href={`/documents/new?project=${projectQuery}`}
                  className={cn(buttonVariants({ variant: "default" }), "h-8 flex-1 bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700")}
                >
                  <FileText className="size-3.5" />
                  Create Letter
                </Link>
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
                {items.map((document) => (
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
                        <DropdownMenuContent align="end" className="w-48">
                          {document.status.toLowerCase() === "draft" ? (
                            <DropdownMenuItem
                              render={
                                <Link href={`/documents/${document.id}/edit`}>
                                  <Pencil className="size-4" />
                                  Edit letter
                                </Link>
                              }
                            />
                          ) : (
                            <DropdownMenuItem
                              render={
                                <Link href={`/documents/${document.id}`}>
                                  <Eye className="size-4" />
                                  View letter
                                </Link>
                              }
                            />
                          )}
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
                          {isActualAdmin ? (
                            <HoldToDeleteDocumentItem
                              document={document}
                              onHoldComplete={handleHoldComplete}
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
              {items.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">No project letters are available.</p>
              ) : (
                items.map((document) => (
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
                          <DropdownMenuContent align="end" className="w-48">
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
                            {isActualAdmin ? (
                              <HoldToDeleteDocumentItem
                                document={document}
                                onHoldComplete={handleHoldComplete}
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

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!isDeleting) {
            setDeleteDialogOpen(open)
            if (!open) {
              setDocumentToDelete(null)
              setDeleteError(null)
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this document?</DialogTitle>
            <DialogDescription className="text-pretty break-words">
              Are you sure you want to permanently delete{" "}
              <span className="font-semibold text-foreground break-all inline-block max-w-full">
                &ldquo;{documentToDelete?.originalFilename || documentToDelete?.title}&rdquo;
              </span>{" "}
              from this project? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deleteError ? (
            <div className="rounded-lg bg-destructive/10 p-3 text-xs font-medium text-destructive">
              {deleteError}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!isDeleting) {
                  setDeleteDialogOpen(false)
                  setDocumentToDelete(null)
                  setDeleteError(null)
                }
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Document"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
