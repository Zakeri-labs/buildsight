"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { acceptInvitation } from "@/lib/actions/invitations"
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
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const emailMismatch = inviteEmail.toLowerCase() !== sessionEmail.toLowerCase()

  function handleAccept() {
    setError(null)
    startTransition(async () => {
      const result = await acceptInvitation(token)
      if (result.ok) {
        router.replace(result.data?.redirect ?? "/dashboard")
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  async function handleSwitchAccount() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace(`/auth/login?next=/invite/${token}`)
    router.refresh()
  }

  if (emailMismatch) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground text-pretty">
          This invitation was sent to <span className="font-medium text-foreground">{inviteEmail}</span>, but
          you&apos;re signed in as <span className="font-medium text-foreground">{sessionEmail}</span>. Switch accounts
          to accept.
        </p>
        <Button variant="outline" onClick={handleSwitchAccount} className="w-full bg-transparent">
          Switch account
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={handleAccept} disabled={pending} className="w-full">
        {pending ? "Accepting..." : `Accept invitation to ${orgName}`}
      </Button>
    </div>
  )
}
