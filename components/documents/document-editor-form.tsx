"use client"

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignJustify,
  AlertCircle,
  Bold,
  CheckCircle2,
  FileText,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  LockKeyhole,
  Redo2,
  Save,
  Send,
  Underline,
  Undo2,
} from "lucide-react"
import { createDocumentAction } from "@/lib/actions/documents"
import { createClient } from "@/lib/supabase/client"
import { EMPTY_RICH_TEXT_DOCUMENT, type RichTextDocument } from "@/lib/documents/rich-text"
import { richTextToEditorHtml, serializeRichText } from "@/lib/documents/rich-text-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type ProjectSummary = { id: string; name: string }
type SaveMode = "draft" | "published"

type UploadState = {
  fileName: string
  progress: number
}

const documentTypes = [
  { value: "general", label: "General Document" },
  { value: "drawing", label: "Drawing" },
  { value: "submittal", label: "Submittal" },
  { value: "report", label: "Report" },
  { value: "contract", label: "Contract" },
]

export function DocumentEditorForm({ project }: { project: ProjectSummary }) {
  const router = useRouter()
  const editorRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const [title, setTitle] = useState("")
  const [documentType, setDocumentType] = useState("general")
  const [content, setContent] = useState<RichTextDocument>(EMPTY_RICH_TEXT_DOCUMENT)
  const [saveMode, setSaveMode] = useState<SaveMode | null>(null)
  const [upload, setUpload] = useState<UploadState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const syncContent = useCallback(() => {
    if (!editorRef.current) return
    setContent(serializeRichText(editorRef.current))
  }, [])

  const restoreSelection = useCallback(() => {
    const root = editorRef.current
    const saved = savedRangeRef.current
    if (!root) return
    root.focus()
    const selection = window.getSelection()
    if (!selection) return
    selection.removeAllRanges()
    if (saved && root.contains(saved.commonAncestorContainer)) {
      selection.addRange(saved)
      return
    }
    const range = document.createRange()
    range.selectNodeContents(root)
    range.collapse(false)
    selection.addRange(range)
  }, [])

  useEffect(() => {
    const root = editorRef.current
    if (!root) return
    root.innerHTML = richTextToEditorHtml(EMPTY_RICH_TEXT_DOCUMENT)

    const rememberSelection = () => {
      const selection = window.getSelection()
      if (!selection?.rangeCount) return
      const range = selection.getRangeAt(0)
      if (root.contains(range.commonAncestorContainer)) savedRangeRef.current = range.cloneRange()
    }

    document.addEventListener("selectionchange", rememberSelection)
    return () => document.removeEventListener("selectionchange", rememberSelection)
  }, [])

  useEffect(() => {
    const root = editorRef.current
    if (!root) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const figure = entry.target as HTMLElement
        figure.dataset.width = String(Math.round(entry.contentRect.width))
      }
      syncContent()
    })

    const observeFigures = () => {
      root.querySelectorAll<HTMLElement>("figure[data-document-image]").forEach((figure) => {
        if (figure.dataset.resizeObserved === "true") return
        figure.dataset.resizeObserved = "true"
        resizeObserver.observe(figure)
      })
    }

    const mutationObserver = new MutationObserver(observeFigures)
    mutationObserver.observe(root, { childList: true, subtree: true })
    observeFigures()

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const removeButton = target.closest<HTMLButtonElement>("[data-remove-image]")
      if (!removeButton) return
      event.preventDefault()
      event.stopPropagation()
      const figure = removeButton.closest<HTMLElement>("figure[data-document-image]")
      if (!figure) return
      const storagePath = figure.dataset.storagePath
      figure.remove()
      syncContent()
      if (storagePath) {
        const supabase = createClient()
        void supabase.storage.from("document-images").remove([storagePath])
      }
    }

    root.addEventListener("click", handleClick)
    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      root.removeEventListener("click", handleClick)
    }
  }, [syncContent])

  const runCommand = (command: string, value?: string) => {
    restoreSelection()
    document.execCommand(command, false, value)
    syncContent()
  }

  const addLink = () => {
    const href = window.prompt("Enter the link URL")?.trim()
    if (!href) return
    const safeHref = /^(https?:|mailto:|tel:)/i.test(href) ? href : `https://${href}`
    runCommand("createLink", safeHref)
  }

  const openImagePicker = () => {
    const selection = window.getSelection()
    if (selection?.rangeCount && editorRef.current?.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      savedRangeRef.current = selection.getRangeAt(0).cloneRange()
    }
    fileInputRef.current?.click()
  }

  const insertImageAtCursor = (storagePath: string, fileName: string) => {
    const root = editorRef.current
    if (!root) return
    restoreSelection()

    const selection = window.getSelection()
    let range = selection?.rangeCount ? selection.getRangeAt(0) : null
    if (!range || !root.contains(range.commonAncestorContainer)) {
      range = document.createRange()
      range.selectNodeContents(root)
      range.collapse(false)
    }
    range.deleteContents()

    const figure = document.createElement("figure")
    figure.dataset.documentImage = "true"
    figure.dataset.storagePath = storagePath
    figure.dataset.width = "640"
    figure.setAttribute("contenteditable", "false")
    figure.style.width = "min(640px, 100%)"

    const image = document.createElement("img")
    image.src = `/api/document-images?path=${encodeURIComponent(storagePath)}`
    image.alt = fileName
    image.draggable = false

    const removeButton = document.createElement("button")
    removeButton.type = "button"
    removeButton.dataset.removeImage = "true"
    removeButton.setAttribute("aria-label", "Remove image")
    removeButton.textContent = "×"
    figure.append(image, removeButton)

    const startElement = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as Element)
      : range.startContainer.parentElement
    let topLevel = startElement as HTMLElement | null
    while (topLevel && topLevel.parentElement !== root) topLevel = topLevel.parentElement

    const afterParagraph = document.createElement("p")
    afterParagraph.append(document.createElement("br"))

    if (topLevel && ["P", "DIV", "H1", "H2", "H3"].includes(topLevel.tagName)) {
      const beforeBlock = topLevel.cloneNode(false) as HTMLElement
      const afterBlock = topLevel.cloneNode(false) as HTMLElement

      const beforeRange = document.createRange()
      beforeRange.selectNodeContents(topLevel)
      beforeRange.setEnd(range.startContainer, range.startOffset)
      beforeBlock.append(beforeRange.cloneContents())

      const afterRange = document.createRange()
      afterRange.selectNodeContents(topLevel)
      afterRange.setStart(range.startContainer, range.startOffset)
      afterBlock.append(afterRange.cloneContents())

      if (!beforeBlock.textContent && !beforeBlock.querySelector("br")) beforeBlock.append(document.createElement("br"))
      if (!afterBlock.textContent && !afterBlock.querySelector("br")) afterBlock.append(document.createElement("br"))
      topLevel.replaceWith(beforeBlock, figure, afterBlock)
      placeCaretAtStart(afterBlock)
    } else if (topLevel) {
      topLevel.after(figure, afterParagraph)
      placeCaretAtStart(afterParagraph)
    } else {
      root.append(figure, afterParagraph)
      placeCaretAtStart(afterParagraph)
    }

    syncContent()
  }

  const handleImageSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setError(null)

    if (!file.type.startsWith("image/")) {
      setError("Choose a valid image file.")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Images must be 10 MB or smaller.")
      return
    }

    try {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error("Your session has expired. Sign in again.")

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "image"
      const storagePath = `${project.id}/${session.user.id}/${crypto.randomUUID()}-${safeName}`
      setUpload({ fileName: file.name, progress: 0 })
      await uploadStorageObject(file, storagePath, session.access_token, (progress) => {
        setUpload({ fileName: file.name, progress })
      })
      setUpload({ fileName: file.name, progress: 100 })
      insertImageAtCursor(storagePath, file.name)
      window.setTimeout(() => setUpload(null), 500)
    } catch (uploadError) {
      setUpload(null)
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload the image.")
    }
  }

  const saveDocument = async (mode: SaveMode) => {
    setError(null)
    setSuccess(null)
    syncContent()

    const currentContent = editorRef.current ? serializeRichText(editorRef.current) : content
    if (!title.trim()) {
      setError("Document title is required.")
      return
    }
    if (upload) {
      setError("Wait for the image upload to finish before saving.")
      return
    }

    setSaveMode(mode)
    try {
      const result = await createDocumentAction({
        projectId: project.id,
        title,
        documentType,
        status: mode,
        content: currentContent,
      })

      if (!result.ok) {
        setSaveMode(null)
        setError(result.error)
        return
      }

      setSuccess(mode === "published" ? "Document published successfully." : "Draft saved successfully.")
      router.push(`/documents/${result.documentId}?created=${mode}`)
    } catch (saveError) {
      setSaveMode(null)
      setError(saveError instanceof Error ? saveError.message : "Unable to save the document.")
    }
  }

  const toolbarButton = "inline-flex size-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
  const isBusy = saveMode !== null || upload !== null

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <Card className="overflow-hidden py-0">
        <CardContent className="flex flex-col gap-4 bg-linear-to-r from-blue-950 to-slate-900 px-6 py-6 text-white sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-200">
              <FileText className="size-4" />
              New project document
            </div>
            <h2 className="truncate text-2xl font-bold sm:text-3xl">{project.name}</h2>
            <p className="mt-1 flex items-center gap-2 text-sm text-blue-100/90">
              <LockKeyhole className="size-4 shrink-0" />
              This document will be saved under this project. The project cannot be changed here.
            </p>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm backdrop-blur">
            <span className="block text-xs text-blue-200">Project context</span>
            <span className="font-semibold">Locked</span>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-5 py-4 sm:px-6">
          <CardTitle className="text-lg">Document details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_240px] sm:px-6">
          <div className="space-y-2">
            <Label htmlFor="document-title">Document title <span className="text-destructive">*</span></Label>
            <Input
              id="document-title"
              value={title}
              maxLength={180}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Enter a clear document title"
              disabled={saveMode !== null}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="document-type">Document type</Label>
            <select
              id="document-type"
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value)}
              disabled={saveMode !== null}
              className="flex h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus:border-ring focus:ring-3 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
            >
              {documentTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center gap-1 border-b bg-slate-50/80 px-3 py-2 dark:bg-slate-900/60">
          <select
            aria-label="Text style"
            defaultValue="p"
            onMouseDown={() => restoreSelection()}
            onChange={(event) => {
              runCommand("formatBlock", event.target.value)
              event.target.value = "p"
            }}
            className="me-1 h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="p">Paragraph</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
          </select>

          <ToolbarButton label="Bold" className={toolbarButton} onAction={() => runCommand("bold")}><Bold className="size-4" /></ToolbarButton>
          <ToolbarButton label="Italic" className={toolbarButton} onAction={() => runCommand("italic")}><Italic className="size-4" /></ToolbarButton>
          <ToolbarButton label="Underline" className={toolbarButton} onAction={() => runCommand("underline")}><Underline className="size-4" /></ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton label="Bulleted list" className={toolbarButton} onAction={() => runCommand("insertUnorderedList")}><List className="size-4" /></ToolbarButton>
          <ToolbarButton label="Numbered list" className={toolbarButton} onAction={() => runCommand("insertOrderedList")}><ListOrdered className="size-4" /></ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton label="Align left" className={toolbarButton} onAction={() => runCommand("justifyLeft")}><AlignLeft className="size-4" /></ToolbarButton>
          <ToolbarButton label="Align centre" className={toolbarButton} onAction={() => runCommand("justifyCenter")}><AlignCenter className="size-4" /></ToolbarButton>
          <ToolbarButton label="Align right" className={toolbarButton} onAction={() => runCommand("justifyRight")}><AlignRight className="size-4" /></ToolbarButton>
          <ToolbarButton label="Justify" className={toolbarButton} onAction={() => runCommand("justifyFull")}><AlignJustify className="size-4" /></ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton label="Add link" className={toolbarButton} onAction={addLink}><Link2 className="size-4" /></ToolbarButton>
          <ToolbarButton label="Insert image" className={toolbarButton} onAction={openImagePicker} disabled={isBusy}><ImagePlus className="size-4" /></ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton label="Undo" className={toolbarButton} onAction={() => runCommand("undo")}><Undo2 className="size-4" /></ToolbarButton>
          <ToolbarButton label="Redo" className={toolbarButton} onAction={() => runCommand("redo")}><Redo2 className="size-4" /></ToolbarButton>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleImageSelected} className="hidden" />
        </div>

        {upload ? (
          <div className="border-b bg-blue-50 px-5 py-3 dark:bg-blue-950/30">
            <div className="mb-2 flex items-center justify-between gap-4 text-xs font-medium text-blue-800 dark:text-blue-200">
              <span className="truncate">Uploading {upload.fileName}</span>
              <span className="tabular-nums">{upload.progress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900">
              <div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${upload.progress}%` }} />
            </div>
          </div>
        ) : null}

        <div
          ref={editorRef}
          contentEditable={!saveMode}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Document content editor"
          data-placeholder="Start writing your document..."
          onInput={syncContent}
          className="document-editor-surface min-h-[620px] bg-white px-6 py-8 text-slate-900 outline-none dark:bg-slate-950 dark:text-slate-100 sm:px-10 lg:px-16"
        />
      </Card>

      {error ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      {success ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <span>{success}</span>
        </div>
      ) : null}

      <div className="sticky bottom-4 z-20 flex flex-col-reverse gap-3 rounded-2xl border bg-background/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" size="lg" disabled={isBusy} onClick={() => void saveDocument("draft")}>
          {saveMode === "draft" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save Draft
        </Button>
        <Button size="lg" disabled={isBusy} onClick={() => void saveDocument("published")}>
          {saveMode === "published" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Publish
        </Button>
      </div>
    </div>
  )
}

function ToolbarButton({
  label,
  className,
  onAction,
  disabled,
  children,
}: {
  label: string
  className: string
  onAction: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault()
        onAction()
      }}
      onClick={(event) => {
        if (event.detail === 0) onAction()
      }}
      className={cn(className, disabled && "cursor-not-allowed opacity-40")}
    >
      {children}
    </button>
  )
}

function ToolbarDivider() {
  return <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
}

function placeCaretAtStart(element: HTMLElement) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  element.closest<HTMLElement>("[contenteditable='true']")?.focus()
}

async function uploadStorageObject(
  file: File,
  path: string,
  accessToken: string,
  onProgress: (progress: number) => void,
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) throw new Error("Supabase storage is not configured.")

  const encodedPath = path.split("/").map(encodeURIComponent).join("/")
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open("POST", `${supabaseUrl}/storage/v1/object/document-images/${encodedPath}`)
    request.setRequestHeader("Authorization", `Bearer ${accessToken}`)
    request.setRequestHeader("apikey", anonKey)
    request.setRequestHeader("Content-Type", file.type)
    request.setRequestHeader("x-upsert", "false")
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      onProgress(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))))
    }
    request.onerror = () => reject(new Error("The image upload failed. Check your connection and try again."))
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100)
        resolve()
        return
      }
      let message = "Unable to upload the image."
      try {
        const response = JSON.parse(request.responseText) as { message?: string; error?: string }
        message = response.message || response.error || message
      } catch {
        // Keep the generic message when the storage response is not JSON.
      }
      reject(new Error(message))
    }
    request.send(file)
  })
}
