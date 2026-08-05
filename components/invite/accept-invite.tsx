"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { acceptInvitation, switchInvitationAccount } from "@/lib/actions/invitations"
import { Button } from "@/components/ui/button"

export function AcceptInvite({
  token,
  inviteEmail,
  sessionEmail,
  orgName,
}: {
  token: string
  inviteEmail: string
  sessionEmail: string
  orgName: string
}) {
  const router = useRouter()
  const attemptedAutomatically = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const emailMismatch = inviteEmail.trim().toLowerCase() !== sessionEmail.trim().toLowerCase()
  const switchAccountAction = switchInvitationAccount.bind(null, token)

  const handleAccept = useCallback(() => {
    setError(null)
    startTransition(async () => {
      const result = await acceptInvitation(token)
      if (result.ok) {
        router.replace(result.data?.redirect ?? "/")
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }, [router, token])

  useEffect(() => {
    if (emailMismatch || attemptedAutomatically.current) return
    attemptedAutomatically.current = true
    handleAccept()
  }, [emailMismatch, handleAccept])

  if (emailMismatch) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground text-pretty">
          This invitation was sent to <span className="font-medium text-foreground">{inviteEmail}</span>, but
          you&apos;re signed in as <span className="font-medium text-foreground">{sessionEmail}</span>. Switch accounts
          to accept.
        </p>
        <form action={switchAccountAction}>
          <Button type="submit" variant="outline" className="w-full bg-transparent">
            Switch account
          </Button>
        </form>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Accepting the invitation for <span className="font-medium text-foreground">{sessionEmail}</span>…
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={handleAccept} disabled={pending} className="w-full">
        {pending ? "Accepting invitation..." : error ? "Try accepting again" : `Accept invitation to ${orgName}`}
      </Button>
    </div>
  )
}
