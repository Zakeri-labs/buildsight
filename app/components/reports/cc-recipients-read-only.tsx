import { Building2, Mail, UserRound } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { profileAvatarDisplayUrl } from "@/lib/profile-avatar"
import type { ReportCcRecipient } from "@/lib/report-cc/types"
import { cn } from "@/lib/utils"

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "CC"
}

function recipientDetails(recipient: ReportCcRecipient) {
  return [recipient.role, recipient.company, recipient.type === "external" ? recipient.email : null]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" · ")
}

export function CcRecipientsReadOnly({
  recipients,
  title = "CC To",
  compact = false,
}: {
  recipients: ReportCcRecipient[]
  title?: string
  compact?: boolean
}) {
  return (
    <Card className={cn("gap-0 py-0", compact && "shadow-none")}>
      <CardHeader className="border-b border-blue-200/80 bg-blue-100/70 px-5 py-3.5 dark:border-blue-800/60 dark:bg-blue-900/50 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-blue-950 dark:text-blue-100">
            <Mail className="size-4 text-primary" />{title}
          </CardTitle>
          <span className="text-xs font-medium text-muted-foreground">{recipients.length}</span>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-5">
        {recipients.length ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {recipients.map((recipient) => {
              const details = recipientDetails(recipient)
              return (
                <div key={recipient.id} className="flex min-w-0 items-center gap-3 rounded-xl border bg-muted/10 px-3 py-2.5">
                  {recipient.type === "internal" ? (
                    <Avatar size="sm">
                      {recipient.avatarUrl ? <AvatarImage src={profileAvatarDisplayUrl(recipient.avatarUrl)} alt="" /> : null}
                      <AvatarFallback>{initials(recipient.name)}</AvatarFallback>
                    </Avatar>
                  ) : (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      {recipient.company ? <Building2 className="size-4" /> : <UserRound className="size-4" />}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{recipient.name}</span>
                    {details ? <span className="block truncate text-xs text-muted-foreground" title={details}>{details}</span> : null}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No CC recipients were selected for this report.</p>
        )}
      </CardContent>
    </Card>
  )
}
