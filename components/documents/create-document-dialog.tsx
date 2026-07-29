"use client"

import { useState, type ChangeEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertCircle, FilePlus2, Loader2, Plus } from "lucide-react"
import { createConstructionDocumentAction } from "@/lib/actions/documents"
import {
  CONSTRUCTION_DOCUMENT_TYPES,
  isConstructionDocumentType,
  type ConstructionDocumentTypeValue,
} from "@/lib/documents/construction-document-types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function CreateDocumentDialog({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [documentType, setDocumentType] = useState<ConstructionDocumentTypeValue | "">("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setTitle("")
    setDocumentType("")
    setDescription("")
    setError(null)
  }

  const createDocument = async () => {
    setError(null)
    if (!title.trim()) {
      setError("Document title is required.")
      return
    }
    if (!isConstructionDocumentType(documentType)) {
      setError("Document type is required.")
      return
    }

    setSubmitting(true)
    try {
      const result = await createConstructionDocumentAction({
        projectId,
        title,
        documentType,
        shortDescription: description,
      })
      if (!result.ok) {
        setError(result.error)
        setSubmitting(false)
        return
      }
      setOpen(false)
      reset()
      router.push(`/documents/${result.documentId}?created=construction`)
      router.refresh()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create the document.")
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button
        size="lg"
        className="h-10 rounded-xl bg-blue-600 px-4 font-semibold text-white shadow-xs hover:bg-blue-700"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" />
        Create Document
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen: boolean) => {
          if (!submitting) {
            setOpen(nextOpen)
            if (!nextOpen) reset()
          }
        }}
      >
        <DialogContent className="max-w-xl gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="border-b bg-slate-50 px-6 py-5 dark:bg-slate-900/70">
            <div className="flex items-start gap-3 pe-8">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                <FilePlus2 className="size-5" />
              </span>
              <div className="space-y-1">
                <DialogTitle className="text-lg font-semibold">Create Document</DialogTitle>
                <DialogDescription>Create a construction document and continue to its details page.</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="grid gap-5 px-6 py-6">
            <div className="space-y-2">
              <Label htmlFor="construction-document-title">Document Title <span className="text-destructive">*</span></Label>
              <Input
                id="construction-document-title"
                value={title}
                maxLength={180}
                autoFocus
                disabled={submitting}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setTitle(event.target.value)}
                placeholder="Enter document title"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="construction-document-type">Document Type <span className="text-destructive">*</span></Label>
              <Select
                value={documentType || null}
                onValueChange={(value: string | null) => setDocumentType(isConstructionDocumentType(value) ? value : "")}
                disabled={submitting}
              >
                <SelectTrigger id="construction-document-type" className="h-11 w-full rounded-lg px-3">
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent align="start">
                  {CONSTRUCTION_DOCUMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="construction-document-description">Short Description</Label>
                <span className="text-xs tabular-nums text-muted-foreground">{description.length}/2000</span>
              </div>
              <textarea
                id="construction-document-description"
                value={description}
                maxLength={2000}
                disabled={submitting}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDescription(event.target.value)}
                placeholder="Optional summary or context"
                className="min-h-28 w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
              />
            </div>

            {error ? (
              <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Need bulk file upload or the existing rich-text editor? <Link href="/documents/new" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">Open advanced creation</Link>.
            </p>
          </div>

          <DialogFooter className="mx-0 mb-0 rounded-none px-6 py-4">
            <Button variant="outline" size="lg" disabled={submitting} onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="lg" disabled={submitting} onClick={() => void createDocument()}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <FilePlus2 className="size-4" />}
              Create Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
