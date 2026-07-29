"use client"

import { useState, type ChangeEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  ArrowLeft,
  FilePlus2,
  Loader2,
  RotateCcw,
} from "lucide-react"
import { DocumentProjectHeader } from "@/components/documents/document-project-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createConstructionDocumentAction } from "@/lib/actions/documents"
import {
  CONSTRUCTION_DOCUMENT_TYPES,
  getDocumentDetailsTemplate,
  isConstructionDocumentType,
  type ConstructionDocumentTypeValue,
} from "@/lib/documents/construction-document-types"

type ProjectSummary = { id: string; name: string }
export function DocumentCreateFlow({ project }: { project: ProjectSummary }) {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [documentType, setDocumentType] = useState<ConstructionDocumentTypeValue | "">("")
  const [description, setDescription] = useState("")
  const [documentDetails, setDocumentDetails] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleDocumentTypeChange = (value: string | null) => {
    if (!isConstructionDocumentType(value)) {
      setDocumentType("")
      setDocumentDetails("")
      return
    }

    setDocumentType(value)
    setDocumentDetails(getDocumentDetailsTemplate(value))
  }

  const createDocument = async () => {
    setError(null)
    setSuccess(null)

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
        projectId: project.id,
        title,
        documentType,
        shortDescription: description,
        documentDetails,
      })

      if (!result.ok) {
        setError(result.error)
        setSubmitting(false)
        return
      }

      setSuccess(`Document ${result.reference || "saved"} was created successfully.`)
      setTitle("")
      setDocumentType("")
      setDescription("")
      setDocumentDetails("")
      setSubmitting(false)
      router.refresh()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create the document.")
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <DocumentProjectHeader projectName={project.name} eyebrow="New construction document" contextLabel="Draft" />

      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-5 py-4 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FilePlus2 className="size-5 text-blue-600 dark:text-blue-400" />
            Create Document
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 px-5 py-5 sm:grid-cols-2 sm:px-6">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="document-title">Document Title <span className="text-destructive">*</span></Label>
            <Input
              id="document-title"
              value={title}
              maxLength={180}
              autoFocus
              disabled={submitting}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setTitle(event.target.value)}
              placeholder="Enter a clear document title"
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="document-type">Document Type <span className="text-destructive">*</span></Label>
            <Select
              value={documentType || null}
              onValueChange={handleDocumentTypeChange}
              disabled={submitting}
            >
              <SelectTrigger id="document-type" className="h-11 w-full rounded-lg px-3">
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
              <Label htmlFor="short-description">Short Description</Label>
              <span className="text-xs tabular-nums text-muted-foreground">{description.length}/2000</span>
            </div>
            <textarea
              id="short-description"
              value={description}
              maxLength={2000}
              disabled={submitting}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDescription(event.target.value)}
              placeholder="Optional summary or context"
              className="min-h-28 w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Document Details</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Selecting a document type loads its editable English template automatically.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={submitting || !documentDetails}
              onClick={() => setDocumentDetails("")}
            >
              <RotateCcw className="size-4" />
              Clear Template
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-5 py-5 sm:px-6">
          <textarea
            id="document-details"
            aria-label="Document Details"
            value={documentDetails}
            maxLength={100000}
            disabled={submitting || !documentType}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDocumentDetails(event.target.value)}
            placeholder={documentType ? "Add document-specific information" : "Select a document type to load its template"}
            className="min-h-[360px] w-full resize-y rounded-xl border border-input bg-transparent px-4 py-3 font-mono text-sm leading-6 outline-none transition-shadow placeholder:font-sans placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-muted/30 disabled:opacity-70 dark:bg-input/20"
          />
        </CardContent>
      </Card>


      {success ? (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          {success}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" render={<Link href="/documents" />} disabled={submitting}>
          <ArrowLeft className="size-4" />
          Back to Documents
        </Button>
        <Button size="lg" disabled={submitting} onClick={() => void createDocument()}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <FilePlus2 className="size-4" />}
          Create Document
        </Button>
      </div>

    </div>
  )
}
