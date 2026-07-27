import Link from "next/link"
import { AlertCircle, ArrowLeft, FolderLock } from "lucide-react"
import { DocumentCreateFlow } from "@/components/documents/document-create-flow"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requireOnboarded } from "@/lib/auth/session"
import { getSelectedProjectId } from "@/lib/project-scope"
import { createClient } from "@/lib/supabase/server"

export default async function NewDocumentPage() {
  await requireOnboarded()
  const selectedProjectId = await getSelectedProjectId()

  if (!selectedProjectId) {
    return <InvalidProjectState message="Select a specific project from the Projects menu before creating a document." />
  }

  const supabase = await createClient()
  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", selectedProjectId)
    .maybeSingle()

  if (!project) {
    return <InvalidProjectState message="The selected project is unavailable or you no longer have access to it." />
  }

  return <DocumentCreateFlow project={{ id: project.id, name: project.name }} />
}

function InvalidProjectState({ message }: { message: string }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 py-8">
      <Link href="/documents" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Back to Documents
      </Link>
      <Card>
        <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
            <FolderLock className="size-7" />
          </span>
          <div className="space-y-1.5">
            <h2 className="text-xl font-semibold">A project is required</h2>
            <p className="max-w-lg text-sm text-muted-foreground">{message}</p>
          </div>
          <Button render={<Link href="/documents" />}>
            <AlertCircle className="size-4" />
            Return to Documents
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
