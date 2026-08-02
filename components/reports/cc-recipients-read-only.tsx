import { Building2, Mail, UserCheck, UserRound } from "lucide-react"
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

function RecipientItem({ recipient }: { recipient: ReportCcRecipient }) {
  const details = recipientDetails(recipient)
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-muted/10 px-3 py-2.5">
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
}

export function CcRecipientsReadOnly({
  recipients,
  title = "Report Recipients & Copies",
  compact = false,
}: {
  recipients: ReportCcRecipient[]
  title?: string
  compact?: boolean
}) {
  const reportToRecipients = recipients.slice(0, 1)
  const ccToRecipients = recipients.slice(1)

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
      <CardContent className="grid gap-6 p-4 sm:p-5 md:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-200">
            <UserCheck className="size-3.5 text-primary" />
            Report to (Primary recipient)
          </div>
          {reportToRecipients.length ? (
            <div className="grid gap-2">
              {reportToRecipients.map((recipient) => (
                <RecipientItem key={recipient.id} recipient={recipient} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No primary recipient selected.</p>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-200">
            <Mail className="size-3.5 text-primary" />
            CC to (Notification copy)
          </div>
          {ccToRecipients.length ? (
            <div className="grid gap-2">
              {ccToRecipients.map((recipient) => (
                <RecipientItem key={recipient.id} recipient={recipient} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No CC recipients selected.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
