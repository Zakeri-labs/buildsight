"use client"

import { useEffect, useState, useTransition, type FocusEvent } from "react"
import { AlertCircle, Check, Copy, Loader2, Mail, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  resendInvitationEmail,
  type InvitationDeliveryErrorCategory,
  type InvitationDeliveryStatus,
} from "@/lib/actions/invitations"

export type InviteResult = {
  invitationId: string
  email: string
  invitationUrl: string | null
  userExists: boolean
  emailStatus: InvitationDeliveryStatus
  emailErrorCategory?: InvitationDeliveryErrorCategory
}

type DeliveryCopy = {
  title: string
  description: string
  secondaryDescription?: string
}

function deliveryCopy(result: InviteResult): DeliveryCopy {
  if (result.emailStatus === "sent") {
    return {
      title: "Invitation email sent",
      description: `The invitation email has been sent successfully to ${result.email}.`,
      secondaryDescription: "You can also copy and share the secure invitation link below if needed.",
    }
  }

  if (result.emailStatus === "not_configured") {
    return {
      title: "Invitation created",
      description: "Automatic email delivery is not currently available. You can share the secure invitation link below manually.",
    }
  }

  return {
    title: "Invitation created",
    description: "The invitation was created, but the email could not be sent.",
    secondaryDescription: "You can share the secure invitation link below manually.",
  }
}

export function InviteLinkDialog({
  result,
  onClose,
  manualShareOnly = false,
}: {
  result: InviteResult | null
  onClose: () => void
  manualShareOnly?: boolean
}) {
  const [current, setCurrent] = useState<InviteResult | null>(result)
  const [copied, setCopied] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    setCurrent(result)
    setCopied(false)
    setRetryError(null)
  }, [result])

  const copy = current
    ? manualShareOnly
      ? {
          title: "Invitation created",
          description: "Please send the secure invitation link below to the intended recipient.",
        }
      : deliveryCopy(current)
    : null

  async function copyLink() {
    if (!current?.invitationUrl) return
    setRetryError(null)
    try {
      await navigator.clipboard.writeText(current.invitationUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setRetryError("Could not copy the invitation link. Select and copy it manually.")
    }
  }

  function retryEmail() {
    if (!current) return
    setRetryError(null)
    startTransition(async () => {
      const response = await resendInvitationEmail(current.invitationId)
      if (!response.ok || !response.data) {
        setRetryError(response.ok ? "Could not resend the invitation email." : response.error)
        return
      }
      setCurrent({ ...response.data, email: current.email })
    })
  }

  return (
    <Dialog open={current != null} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2">
            {current?.emailStatus === "sent" && (
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                <Check className="size-4" />
              </div>
            )}
            <DialogTitle className="text-lg font-bold">{copy?.title ?? "Invitation"}</DialogTitle>
          </div>
          <DialogDescription className="text-sm text-foreground text-pretty">
            {copy?.description}
          </DialogDescription>
          {copy?.secondaryDescription && (
            <p className="text-xs text-muted-foreground">{copy.secondaryDescription}</p>
          )}
        </DialogHeader>

        {current?.emailStatus === "provider_error" && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p>The invitation remains pending. No membership has been created or accepted.</p>
          </div>
        )}

        {current?.invitationUrl ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Secure invitation link</p>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  readOnly
                  value={current.invitationUrl}
                  className="ps-9 text-xs"
                  onFocus={(event: FocusEvent<HTMLInputElement>) => event.currentTarget.select()}
                />
              </div>
              <Button type="button" variant="outline" onClick={copyLink} className="shrink-0 bg-transparent">
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            A safe public invitation link is unavailable. Configure the application&apos;s trusted public site URL before retrying.
          </p>
        )}

        {current?.userExists && (
          <p className="text-xs text-muted-foreground">
            This email already has an account. The invitation link will use the existing sign-in flow and will not create a duplicate user.
          </p>
        )}

        {retryError && <p className="text-sm text-destructive">{retryError}</p>}

        <DialogFooter className="sm:justify-between">
          {current && current.emailStatus !== "sent" ? (
            <Button
              type="button"
              variant="outline"
              onClick={retryEmail}
              disabled={pending}
              className="bg-transparent"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Retry email
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
