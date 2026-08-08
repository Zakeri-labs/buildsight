import Link from "next/link"
import { ArrowLeft, ShieldAlert } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function ProjectStagesAccessDenied() {
  return (
    <div className="flex min-h-[calc(100dvh-9.5rem)] items-center justify-center py-6 md:min-h-[calc(100vh-8rem)] md:py-10">
      <section
        role="alert"
        aria-labelledby="project-stages-access-denied-title"
        className="w-full max-w-md rounded-2xl border bg-card px-5 py-8 text-center shadow-sm sm:px-7 md:py-10"
      >
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ShieldAlert className="size-6" aria-hidden="true" />
        </div>
        <h1 id="project-stages-access-denied-title" className="mt-4 text-xl font-semibold tracking-tight">
          Access Denied
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
          You don&apos;t have access to this project&apos;s stages.
        </p>
        <Link href="/projects" className={cn(buttonVariants(), "mt-5 min-w-36")}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Projects
        </Link>
      </section>
    </div>
  )
}
