"use client"

import { useState } from "react"
import { FilePenLine, UploadCloud } from "lucide-react"
import { DocumentEditorForm } from "@/components/documents/document-editor-form"
import { DocumentProjectHeader } from "@/components/documents/document-project-header"
import { SimpleDocumentUploadForm } from "@/components/documents/simple-document-upload-form"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type ProjectSummary = { id: string; name: string }
type CreationMode = "simple" | "advanced"

export function DocumentCreateFlow({ project }: { project: ProjectSummary }) {
  const [mode, setMode] = useState<CreationMode>("simple")

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <DocumentProjectHeader projectName={project.name} />

      <Card className="py-0">
        <CardContent className="p-2">
          <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Document creation mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "simple"}
              onClick={() => setMode("simple")}
              className={cn(
                "flex min-h-14 items-center justify-center gap-3 rounded-xl px-4 py-3 text-start transition-colors",
                mode === "simple" ? "bg-blue-950 text-white shadow-sm dark:bg-blue-600" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <UploadCloud className="size-5 shrink-0" />
              <span><span className="block text-sm font-semibold">Simple</span><span className={cn("hidden text-xs sm:block", mode === "simple" ? "text-blue-100" : "text-muted-foreground")}>Fast multi-file upload</span></span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "advanced"}
              onClick={() => setMode("advanced")}
              className={cn(
                "flex min-h-14 items-center justify-center gap-3 rounded-xl px-4 py-3 text-start transition-colors",
                mode === "advanced" ? "bg-blue-950 text-white shadow-sm dark:bg-blue-600" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <FilePenLine className="size-5 shrink-0" />
              <span><span className="block text-sm font-semibold">Advanced</span><span className={cn("hidden text-xs sm:block", mode === "advanced" ? "text-blue-100" : "text-muted-foreground")}>Structured rich-text document</span></span>
            </button>
          </div>
        </CardContent>
      </Card>

      <section role="tabpanel" aria-label="Simple document upload" className={mode === "simple" ? "block" : "hidden"}>
        <SimpleDocumentUploadForm project={project} />
      </section>
      <section role="tabpanel" aria-label="Advanced document editor" className={mode === "advanced" ? "block" : "hidden"}>
        <DocumentEditorForm project={project} showProjectHeader={false} showAdvancedModeLabel />
      </section>
    </div>
  )
}
