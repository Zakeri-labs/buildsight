"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2, Paperclip, Upload, X } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

const ACCEPTED_FILE_TYPES = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".png", ".jpg", ".jpeg"]

function isAcceptedFile(file: File) {
  const fileName = file.name.toLowerCase()
  return ACCEPTED_FILE_TYPES.some((extension) => fileName.endsWith(extension))
}

export default function NewReportPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [titleError, setTitleError] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [pending, setPending] = useState(false)

  function addFiles(nextFiles: FileList | File[]) {
    const incoming = Array.from(nextFiles)
    const accepted = incoming.filter(isAcceptedFile)
    const rejectedCount = incoming.length - accepted.length

    setFiles((current) => {
      const deduped = accepted.filter(
        (candidate) =>
          !current.some(
            (existing) =>
              existing.name === candidate.name &&
              existing.size === candidate.size &&
              existing.lastModified === candidate.lastModified
          )
      )
      return [...current, ...deduped]
    })

    setFileError(rejectedCount > 0 ? "Some files were skipped because their format is not supported." : null)
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))
    setFileError(null)
  }

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedTitle = title.trim()
    const nextTitleError = trimmedTitle ? null : "Report title is required."

    setTitleError(nextTitleError)
    setFileError(null)

    if (nextTitleError) return

    setPending(true)
    setSuccess("Report created successfully. Redirecting to reports...")

    await new Promise((resolve) => window.setTimeout(resolve, 900))

    router.push("/reports")
    router.refresh()
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Create Report</CardTitle>
          <CardDescription>
            Add a new report, attach supporting files, and review everything before creating it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="report-title">Report Title*</Label>
              <Input
                id="report-title"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value)
                  if (titleError) setTitleError(null)
                }}
                placeholder="e.g. Weekly Site Progress Report"
                required
                aria-invalid={Boolean(titleError)}
                disabled={pending}
              />
              {titleError && <p className="text-sm text-destructive">{titleError}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="report-description">Description</Label>
              <textarea
                id="report-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Add any context, observations, or notes for this report."
                rows={6}
                disabled={pending}
                className={cn(
                  "flex w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30"
                )}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="report-attachments">Attachments</Label>
              <input
                ref={fileInputRef}
                id="report-attachments"
                type="file"
                multiple
                accept={ACCEPTED_FILE_TYPES.join(",")}
                className="hidden"
                onChange={(event) => {
                  if (event.target.files) addFiles(event.target.files)
                  event.target.value = ""
                }}
              />

              <div
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragActive(true)
                }}
                onDragEnter={(event) => {
                  event.preventDefault()
                  setDragActive(true)
                }}
                onDragLeave={(event) => {
                  event.preventDefault()
                  if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
                  setDragActive(false)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  setDragActive(false)
                  if (pending) return
                  addFiles(event.dataTransfer.files)
                }}
                className={cn(
                  "rounded-xl border border-dashed px-6 py-8 text-center transition-colors",
                  dragActive ? "border-primary bg-primary/5" : "border-border bg-muted/20"
                )}
              >
                <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                  <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Upload className="size-5" />
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Drag and drop files here, or browse</p>
                    <p className="text-sm text-muted-foreground">
                      Accepted: PDF, DOC, DOCX, XLS, XLSX, PNG, JPG, JPEG
                    </p>
                  </div>
                  <Button type="button" variant="outline" onClick={openFilePicker} disabled={pending} className="bg-transparent">
                    Browse files
                  </Button>
                </div>
              </div>

              {fileError && <p className="text-sm text-destructive">{fileError}</p>}

              {files.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">Selected files</p>
                  <div className="space-y-2">
                    {files.map((file, index) => (
                      <div
                        key={`${file.name}-${file.size}-${file.lastModified}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(file.size / 1024 / 1024).toFixed(file.size >= 1024 * 1024 ? 2 : 1)} MB
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeFile(index)}
                          disabled={pending}
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {success && (
              <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm text-success">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <CardFooter className="mt-2 justify-end gap-2 px-0">
              <Link href="/reports" className={cn(buttonVariants({ variant: "outline" }), "bg-transparent")}>
                Cancel
              </Link>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" data-icon="inline-start" />}
                Create Report
              </Button>
            </CardFooter>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
