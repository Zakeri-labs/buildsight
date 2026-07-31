import { FileText, LockKeyhole } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

export function DocumentProjectHeader({
  projectName,
  contextLabel = "Locked",
  eyebrow = "Add project letters",
}: {
  projectName: string
  contextLabel?: string
  eyebrow?: string
}) {
  return (
    <Card className="overflow-hidden py-0">
      <CardContent className="flex flex-col gap-4 bg-linear-to-r from-blue-950 to-slate-900 px-6 py-6 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-200">
            <FileText className="size-4" />
            {eyebrow}
          </div>
          <h1 className="truncate text-2xl font-bold sm:text-3xl">{projectName}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-blue-100/90">
            <LockKeyhole className="size-4 shrink-0" />
            Every document will be saved under this project. The project cannot be changed here.
          </p>
        </div>
        <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm backdrop-blur">
          <span className="block text-xs text-blue-200">Project context</span>
          <span className="font-semibold">{contextLabel}</span>
        </div>
      </CardContent>
    </Card>
  )
}
