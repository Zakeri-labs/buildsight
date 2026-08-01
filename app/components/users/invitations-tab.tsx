"use client"

import { useState, useTransition } from "react"
import { Copy, Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { InviteStatusBadge, OrgRoleBadge } from "@/components/users/role-badges"
import { revokeInvitation } from "@/lib/actions/invitations"
import type { InvitationRow } from "@/lib/db/admin-console"

export function InvitationsTab({ invitations }: { invitations: InvitationRow[] }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground text-pretty">
        Pending and past invitations. Share the secure link directly, or revoke access before it&apos;s accepted.
      </p>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-end">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No invitations yet.
                  </TableCell>
                </TableRow>
              )}
              {invitations.map((inv) => (
                <InvitationRowItem key={inv.id} invitation={inv} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function InvitationRowItem({ invitation }: { invitation: InvitationRow }) {
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const isPending = invitation.status === "pending"

  async function copy() {
    const link = `${window.location.origin}/invite/${invitation.token}`
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  function revoke() {
    setError(null)
    startTransition(async () => {
      const res = await revokeInvitation(invitation.id)
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{invitation.email}</TableCell>
      <TableCell className="text-muted-foreground">{invitation.organizationName}</TableCell>
      <TableCell>
        <OrgRoleBadge role={invitation.organizationRole} />
      </TableCell>
      <TableCell className="text-muted-foreground">{invitation.projectName ?? "—"}</TableCell>
      <TableCell>
        <InviteStatusBadge status={invitation.status} />
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </TableCell>
      <TableCell className="text-end">
        <div className="flex justify-end gap-2">
          {isPending && (
            <>
              <Button variant="ghost" size="sm" onClick={copy}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy link"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={revoke}
                disabled={pending}
                className="text-destructive"
              >
                {pending && <Loader2 className="size-4 animate-spin" data-icon="inline-start" />}
                Revoke
              </Button>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}
