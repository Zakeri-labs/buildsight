import Link from "next/link"
import { AlertCircle, ArrowLeft } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type ReportCreationBlockedProps = {
  remainingReportCredits: number
  backHref?: string
  backLabel?: string
}

export function ReportCreationBlocked({
  remainingReportCredits,
  backHref = "/projects",
  backLabel = "Back to Projects",
}: ReportCreationBlockedProps) {
  return (
    <div className="mx-auto flex w-full max-w-xl items-center justify-center py-10">
      <Card className="w-full border-destructive/30 shadow-sm">
        <CardHeader className="space-y-3 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="size-6" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight text-foreground">
              Report Creation Unavailable
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            Your organization has exhausted its Report Credits. New reports cannot be created until additional credits are added.
          </p>
          <p>
            Please contact your administrator.
          </p>
          <div className="rounded-lg border border-border/60 bg-muted/40 p-3">
            <span className="font-medium text-foreground">Remaining Credits: </span>
            <span className="font-semibold text-destructive">{remainingReportCredits}</span>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end pt-2">
          <Link
            href={backHref}
            className={cn(buttonVariants({ variant: "default" }), "gap-2")}
          >
            <ArrowLeft className="size-4" />
            {backLabel}
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
